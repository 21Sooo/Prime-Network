const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const { createCanvas, registerFont } = require('canvas');
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;

// --- CONFIG ---
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

const devisCache = new Map();

// --- FONTS ---
const fontPath = path.join(__dirname, 'Roboto-Regular.ttf');
const sigPath = path.join(__dirname, 'DancingScript.ttf');

if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'PrimeFont' });
if (fs.existsSync(sigPath)) registerFont(sigPath, { family: 'SignatureFont' });

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- FILES ---
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

if (!fs.existsSync(panelFile))
  fs.writeFileSync(panelFile, JSON.stringify({ photoMessageId: null, modelMessageId: null, dashboardMessageId: null }, null, 2));

if (!fs.existsSync(statusFile))
  fs.writeFileSync(statusFile, JSON.stringify({ photoStatuses: {}, modelStatuses: {} }, null, 2));

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));
const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// --- DEVIS ---
async function createPrimeDevis(data, signatureName = null) {
  const canvas = createCanvas(800, 1000);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 800, 1000);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 800, 160);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 50px sans-serif";
  ctx.fillText("PRIME NETWORK", 50, 75);

  ctx.font = "24px sans-serif";
  ctx.fillText("DEVIS & FACTURATION OFFICIELLE", 50, 120);

  ctx.fillStyle = "#000";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`CLIENT : ${data.client}`, 50, 230);

  ctx.font = "22px sans-serif";
  ctx.fillText(`Téléphone : ${data.telephone}`, 50, 280);
  ctx.fillText(`Prestation : ${data.photos} photo(s)`, 50, 320);

  ctx.beginPath();
  ctx.moveTo(50, 360);
  ctx.lineTo(750, 360);
  ctx.stroke();

  ctx.font = "20px sans-serif";
  ctx.fillText(data.description, 50, 420);

  ctx.font = "bold 35px sans-serif";
  ctx.fillText(`TOTAL : $${data.prix}`, 50, 850);

  if (signatureName) {
    ctx.font = "50px 'SignatureFont'";
    ctx.fillText(signatureName, 450, 920);
  }

  return canvas.toBuffer();
}

// --- PLANNING ---
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

function generateEmbed(title, data, color) {
  const desc = Object.entries(data)
    .map(([u, s]) => `• **${u}** → ${s}`)
    .join("\n") || "_Aucun_";

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(desc)
    .setTimestamp();
}

async function updatePanel(channelId, embed, key) {
  const channel = await client.channels.fetch(channelId);
  const panels = getPanels();

  let msg;
  if (panels[key]) {
    try { msg = await channel.messages.fetch(panels[key]); } catch {}
  }

  if (!msg) {
    msg = await channel.send({ embeds: [embed], components: [dispoButtons] });
    panels[key] = msg.id;
    savePanels(panels);
  } else {
    await msg.edit({ embeds: [embed], components: [dispoButtons] });
  }
}

async function refreshAll() {
  await updatePanel(PHOTO_CHANNEL_ID, generateEmbed("📸 Photographes", photoStatuses, "#00bfff"), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, generateEmbed("👠 Modèles", modelStatuses, "#ff69b4"), "modelMessageId");
}

// --- READY ---
client.once("ready", async () => {
  console.log("✅ Bot en ligne");
  await refreshAll();
});

// --- INTERACTIONS ---
client.on("interactionCreate", async interaction => {

  const username = interaction.user.username;

  // --- WATERMARK ---
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {

    await interaction.deferReply();

    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position") || "southeast";
    const logo = interaction.options.getString("logo") || "1";

    const watermarkFile =
      logo === "2" ? "watermark2.png" :
      logo === "3" ? "watermark3.png" :
      "watermark.png";

    try {
      const res = await fetch(attach.url);
      const buffer = Buffer.from(await res.arrayBuffer());

      const img = sharp(buffer);
      const meta = await img.metadata();

      const wMark = await sharp(path.join(__dirname, watermarkFile))
        .resize({ width: Math.floor(meta.width * 0.06) })
        .png()
        .toBuffer();

      const out = await img.composite([{
        input: wMark,
        gravity: pos,
        opacity: 0.8
      }]).toBuffer();

      await interaction.editReply({
        files: [new AttachmentBuilder(out, { name: "watermark.png" })]
      });

    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Erreur.");
    }
  }

  // --- DEVIS ---
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {

    await interaction.deferReply();

    const data = {
      client: interaction.options.getString("client"),
      telephone: interaction.options.getString("telephone"),
      photos: interaction.options.getInteger("photos"),
      description: interaction.options.getString("description"),
      prix: interaction.options.getInteger("prix")
    };

    const id = Date.now().toString();
    devisCache.set(id, data);

    const buffer = await createPrimeDevis(data);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${id}`).setLabel("Signer").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("refuse").setLabel("Refuser").setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "devis.png" })],
      components: [row]
    });
  }

  // --- BOUTONS ---
  if (interaction.isButton()) {

    if (interaction.customId.startsWith("sign_")) {
      const id = interaction.customId.split("_")[1];
      const data = devisCache.get(id);

      const buffer = await createPrimeDevis(data, interaction.user.username);

      await interaction.update({
        content: "✅ Signé",
        files: [new AttachmentBuilder(buffer, { name: "facture.png" })],
        components: []
      });
    }

    if (interaction.customId === "refuse") {
      return interaction.update({ content: "❌ Refusé", components: [] });
    }

    if (interaction.customId === "dispo_on" || interaction.customId === "dispo_off") {
      const status = interaction.customId === "dispo_on" ? "🟢" : "🔴";
      photoStatuses[username] = status;
      saveStatuses({ photoStatuses, modelStatuses });
      await refreshAll();
      return interaction.reply({ content: "✅ MAJ", flags: 64 });
    }
  }
});

client.login(TOKEN);
