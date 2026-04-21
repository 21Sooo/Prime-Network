const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const { createCanvas } = require('canvas');
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const GUILD_ID = "1403500050067230730";

// --- CONFIG ---
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

const devisCache = new Map();

// --- FILES ---
const panelFile = "./panels.json";
const statusFile = "./statuses.json";

if (!fs.existsSync(panelFile)) {
  fs.writeFileSync(panelFile, JSON.stringify({
    photoMessageId: null,
    modelMessageId: null,
    dashboardMessageId: null
  }, null, 2));
}

if (!fs.existsSync(statusFile)) {
  fs.writeFileSync(statusFile, JSON.stringify({
    photoStatuses: {},
    modelStatuses: {}
  }, null, 2));
}

const getPanels = () => JSON.parse(fs.readFileSync(panelFile));
const savePanels = (data) => fs.writeFileSync(panelFile, JSON.stringify(data, null, 2));

const getStatuses = () => JSON.parse(fs.readFileSync(statusFile));
const saveStatuses = (data) => fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));

let { photoStatuses, modelStatuses } = getStatuses();

// --- CLIENT ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// --- EMBEDS ---
async function generatePhotoEmbed(guild) {
  let desc = "";

  for (const userId in photoStatuses) {
    try {
      const member = await guild.members.fetch(userId);
      const name = member.nickname || member.user.username;
      desc += `• **${name}** → ${photoStatuses[userId]}\n`;
    } catch {
      delete photoStatuses[userId];
    }
  }

  if (!desc) desc = "_Aucun photographe_";

  return new EmbedBuilder()
    .setTitle("📸 Planning Photographes")
    .setColor("#00bfff")
    .setDescription(desc)
    .setTimestamp();
}

async function generateModelEmbed(guild) {
  let desc = "";

  for (const userId in modelStatuses) {
    try {
      const member = await guild.members.fetch(userId);
      const name = member.nickname || member.user.username;
      desc += `• **${name}** → ${modelStatuses[userId]}\n`;
    } catch {
      delete modelStatuses[userId];
    }
  }

  if (!desc) desc = "_Aucun modèle_";

  return new EmbedBuilder()
    .setTitle("👠 Planning Modèles")
    .setColor("#ff69b4")
    .setDescription(desc)
    .setTimestamp();
}

function generateDashboardEmbed() {
  const p = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const m = Object.values(modelStatuses).filter(s => s === "🟢").length;

  return new EmbedBuilder()
    .setTitle("📊 Dashboard Global")
    .setColor("#2f3136")
    .addFields(
      { name: "📸 Photographes actifs", value: `${p}`, inline: true },
      { name: "👠 Modèles actifs", value: `${m}`, inline: true }
    )
    .setTimestamp();
}

// --- PANELS ---
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

async function updatePanel(channelId, embed, key) {
  const channel = await client.channels.fetch(channelId);
  const panels = getPanels();

  let msg;
  if (panels[key]) {
    try { msg = await channel.messages.fetch(panels[key]); } catch {}
  }

  if (!msg) {
    msg = await channel.send({
      embeds: [embed],
      components: key !== "dashboardMessageId" ? [dispoButtons] : []
    });
    panels[key] = msg.id;
    savePanels(panels);
  } else {
    await msg.edit({
      embeds: [embed],
      components: key !== "dashboardMessageId" ? [dispoButtons] : []
    });
  }
}

async function refreshAll() {
  const guild = await client.guilds.fetch(GUILD_ID);

  await updatePanel(PHOTO_CHANNEL_ID, await generatePhotoEmbed(guild), "photoMessageId");
  await updatePanel(MODEL_CHANNEL_ID, await generateModelEmbed(guild), "modelMessageId");
  await updatePanel(DASHBOARD_CHANNEL_ID, generateDashboardEmbed(), "dashboardMessageId");

  saveStatuses({ photoStatuses, modelStatuses });
}

// --- AUTO RECREATE ---
client.on("messageDelete", async (msg) => {
  const panels = getPanels();

  if (
    msg.id === panels.photoMessageId ||
    msg.id === panels.modelMessageId ||
    msg.id === panels.dashboardMessageId
  ) {
    console.log("🔁 Panel supprimé → recréation");
    await refreshAll();
  }
});

// --- READY ---
client.once("ready", async () => {
  console.log("✅ Bot prêt");
  await refreshAll();
});

// --- INTERACTIONS ---
client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;

  // --- WATERMARK ---
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {

    if (interaction.channelId !== WATERMARK_CHANNEL_ID)
      return interaction.reply({ content: "❌ Mauvais salon", flags: 64 });

    await interaction.deferReply();

    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position") || "southeast";
    const logo = interaction.options.getString("logo") || "1";

    const file =
      logo === "2" ? "watermark2.png" :
      logo === "3" ? "watermark3.png" :
      "watermark.png";

    try {
      const res = await fetch(attach.url);
      const buffer = Buffer.from(await res.arrayBuffer());

      const img = sharp(buffer);
      const meta = await img.metadata();

      const wMark = await sharp(path.join(__dirname, file))
        .resize({ width: Math.floor(meta.width * 0.06) })
        .toBuffer();

      const out = await img.composite([{
        input: wMark,
        gravity: pos,
        opacity: 0.8
      }]).toBuffer();

      await interaction.editReply({
        files: [new AttachmentBuilder(out, { name: "prime.png" })]
      });

    } catch (e) {
      console.error(e);
      await interaction.editReply("❌ Erreur watermark");
    }
  }

  // --- DEVIS ---
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {

    await interaction.deferReply();

    const data = {
      client: interaction.options.getString('client'),
      telephone: interaction.options.getString('telephone'),
      photos: interaction.options.getInteger('photos'),
      description: interaction.options.getString('description'),
      prix: interaction.options.getInteger('prix')
    };

    const id = Date.now().toString();
    devisCache.set(id, data);

    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 800, 1000);

    ctx.fillStyle = "#000";
    ctx.font = "30px sans-serif";
    ctx.fillText(`Client: ${data.client}`, 50, 100);
    ctx.fillText(`Téléphone: ${data.telephone}`, 50, 150);
    ctx.fillText(`Photos: ${data.photos}`, 50, 200);
    ctx.fillText(`Prix: $${data.prix}`, 50, 250);

    const buffer = canvas.toBuffer();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${id}`).setLabel("Signer").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("refuse").setLabel("Refuser").setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "devis.png" })],
      components: [row]
    });
  }

  // --- BOUTONS AVEC RESTRICTION RÔLES ---
  if (interaction.isButton()) {

    const member = interaction.member;
    const status = interaction.customId === "dispo_on" ? "🟢" : "🔴";

    // PHOTOGRAPHES
    if (interaction.channelId === PHOTO_CHANNEL_ID) {

      if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) {
        return interaction.reply({
          content: "❌ Tu n'es pas photographe.",
          flags: 64
        });
      }

      photoStatuses[userId] = status;
    }

    // MODELS
    else if (interaction.channelId === MODEL_CHANNEL_ID) {

      if (!member.roles.cache.some(r => r.name === MODEL_ROLE)) {
        return interaction.reply({
          content: "❌ Tu n'es pas modèle.",
          flags: 64
        });
      }

      modelStatuses[userId] = status;
    }

    else return;

    saveStatuses({ photoStatuses, modelStatuses });
    await refreshAll();

    return interaction.reply({
      content: "✅ Statut mis à jour",
      flags: 64
    });
  }
});

client.login(TOKEN);
