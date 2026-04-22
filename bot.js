// ===== IMPORTS =====
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

const fetch = global.fetch;

const TOKEN = process.env.TOKEN;
const GUILD_ID = "1403500050067230730";

// ===== FONTS =====
try {
  registerFont(path.join(__dirname, 'DancingScript.ttf'), { family: 'Dancing' });
  registerFont(path.join(__dirname, 'Roboto-Regular.ttf'), { family: 'Roboto' });
} catch {}

// ===== CONFIG =====
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";
const DEVIS_CHANNEL_ID = "1466817112252219558";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

// ===== CACHE =====
const devisCache = new Map();
const devisSigners = new Map();
const devisLocks = new Set();

// ===== FILES =====
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

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ===== UTILS =====
function cleanDevis(id) {
  setTimeout(() => {
    devisCache.delete(id);
    devisSigners.delete(id);
    devisLocks.delete(id);
  }, 600000);
}

// ===== EMBEDS =====
async function generatePhotoEmbed(guild) {
  let desc = "";
  for (const userId in photoStatuses) {
    try {
      const member = await guild.members.fetch(userId);
      desc += `• **${member.displayName}** → ${photoStatuses[userId]}\n`;
    } catch {}
  }
  if (!desc) desc = "_Aucun photographe_";
  return new EmbedBuilder().setTitle("📸 Planning Photographes").setDescription(desc).setColor("#00bfff");
}

async function generateModelEmbed(guild) {
  let desc = "";
  for (const userId in modelStatuses) {
    try {
      const member = await guild.members.fetch(userId);
      desc += `• **${member.displayName}** → ${modelStatuses[userId]}\n`;
    } catch {}
  }
  if (!desc) desc = "_Aucun modèle_";
  return new EmbedBuilder().setTitle("👠 Planning Modèles").setDescription(desc).setColor("#ff69b4");
}

function generateDashboardEmbed() {
  const p = Object.values(photoStatuses).filter(s => s === "🟢").length;
  const m = Object.values(modelStatuses).filter(s => s === "🟢").length;
  return new EmbedBuilder().setTitle("📊 Dashboard")
    .addFields(
      { name: "📸 Photographes actifs", value: `${p}`, inline: true },
      { name: "👠 Modèles actifs", value: `${m}`, inline: true }
    );
}

// ===== DISPO BUTTONS =====
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

// ===== READY =====
client.once("ready", () => console.log("✅ Bot prêt"));

// ===== INTERACTIONS =====
client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;

  // ===== WATERMARK FIX =====
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {
    await interaction.deferReply();

    const attach = interaction.options.getAttachment("image");
    const pos = (interaction.options.getString("position") || "southeast").toLowerCase();

    const buffer = Buffer.from(await (await fetch(attach.url)).arrayBuffer());
    const img = sharp(buffer);
    const meta = await img.metadata();

    const logo = await sharp(path.join(__dirname, "watermark.png"))
      .resize({ width: Math.floor(meta.width * 0.05) })
      .toBuffer();

    const wm = await sharp(logo).metadata();

    let top = 0, left = 0;

    switch(pos){
      case "center":
        top = (meta.height - wm.height)/2;
        left = (meta.width - wm.width)/2;
        break;
      case "north":
        top = 10;
        left = (meta.width - wm.width)/2;
        break;
      case "south":
        top = meta.height - wm.height - 10;
        left = (meta.width - wm.width)/2;
        break;
      case "northeast":
        top = 10;
        left = meta.width - wm.width - 10;
        break;
      case "northwest":
        top = 10;
        left = 10;
        break;
      case "southwest":
        top = meta.height - wm.height - 10;
        left = 10;
        break;
      default:
        top = meta.height - wm.height - 10;
        left = meta.width - wm.width - 10;
    }

    const out = await img.composite([{ input: logo, top, left }]).toBuffer();
    return interaction.editReply({ files: [new AttachmentBuilder(out)] });
  }

  // ===== DEVIS =====
  if (interaction.isChatInputCommand() && interaction.commandName === "devis") {
    await interaction.deferReply();

    const data = {
      client: interaction.options.getString('client'),
      telephone: interaction.options.getString('telephone'),
      description: interaction.options.getString('description'),
      prix: interaction.options.getInteger('prix')
    };

    const id = Date.now().toString();
    devisCache.set(id, data);
    cleanDevis(id);

    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111";
    ctx.fillRect(0,0,800,600);

    ctx.fillStyle="#fff";
    ctx.font="30px Roboto";
    ctx.fillText("DEVIS",50,50);
    ctx.fillText(`Client : ${data.client}`,50,120);
    ctx.fillText(`Téléphone : ${data.telephone}`,50,160);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${id}`).setLabel("Signer").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse_${id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({
      content:`📝 Nouveau devis généré par ${interaction.user.username}`,
      files:[new AttachmentBuilder(canvas.toBuffer())],
      components:[row]
    });
  }

  // ===== SIGN =====
  if (interaction.isButton() && interaction.customId.startsWith("sign_")) {

    const id = interaction.customId.split("_")[1];
    if (devisLocks.has(id)) return;
    devisLocks.add(id);

    const data = devisCache.get(id);
    devisSigners.set(id, interaction.user.id);

    const file = interaction.message.attachments.first();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`send_mp_${id}`).setLabel("📩 MP").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`send_channel_${id}`).setLabel("📤 Channel").setStyle(ButtonStyle.Secondary)
    );

    devisLocks.delete(id);

    return interaction.update({
      content:`✅ Devis signé par ${interaction.user.username}`,
      files:[file],
      components:[row]
    });
  }

  // ===== SEND =====
  if (interaction.isButton() && interaction.customId.startsWith("send_")) {

    const id = interaction.customId.split("_")[2];
    const data = devisCache.get(id);
    const signerId = devisSigners.get(id);
    const file = interaction.message.attachments.first();

    if (!data) return interaction.reply({ content:"❌ Devis expiré", flags:64 });

    if (interaction.customId.startsWith("send_mp")) {
      const user = await client.users.fetch(signerId);
      await user.send({ files:[file] });
    }

    if (interaction.customId.startsWith("send_channel")) {
      const channel = await client.channels.fetch(DEVIS_CHANNEL_ID);
      await channel.send({
        content:`Client : ${data.client}\nTéléphone : ${data.telephone}`,
        files:[file]
      });
    }

    return interaction.reply({ content:"✅ Envoyé !", flags:64 });
  }

});

client.login(TOKEN);
