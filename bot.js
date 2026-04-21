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

const fetch = global.fetch; // ✅ FIX IMPORTANT

const TOKEN = process.env.TOKEN;
const GUILD_ID = "1403500050067230730";

// FONTS
try {
  registerFont(path.join(__dirname, 'DancingScript.ttf'), { family: 'Dancing' });
  registerFont(path.join(__dirname, 'Roboto-Regular.ttf'), { family: 'Roboto' });
} catch {}

// CONFIG
const PHOTO_CHANNEL_ID = "1403500792106717235";
const MODEL_CHANNEL_ID = "1477705326525681806";
const DASHBOARD_CHANNEL_ID = "1490305746598887435";
const WATERMARK_CHANNEL_ID = "1462586238648324146";

const PHOTO_ROLE = "🎥・Prime Photographer";
const MODEL_ROLE = "👠・Prime Model";

const devisCache = new Map();

// FILES
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

// CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// EMBEDS
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

// BUTTONS
const dispoButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("dispo_on").setLabel("🟢 Disponible").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("dispo_off").setLabel("🔴 Indisponible").setStyle(ButtonStyle.Danger)
);

// PANELS
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

// READY
client.once("ready", async () => {
  console.log("✅ Bot prêt");
  await refreshAll();
});

// DELETE PANEL
client.on("messageDelete", async (msg) => {
  const panels = getPanels();

  if (
    msg.id === panels.photoMessageId ||
    msg.id === panels.modelMessageId ||
    msg.id === panels.dashboardMessageId
  ) {
    await refreshAll();
  }
});

// INTERACTIONS
client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;

  // ===== WATERMARK FIX FINAL =====
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {

    if (interaction.channelId !== WATERMARK_CHANNEL_ID)
      return interaction.reply({ content: "❌ Mauvais salon", flags: 64 });

    await interaction.deferReply();

    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position");
    const logo = interaction.options.getString("logo") || "1";

    try {
      const buffer = Buffer.from(await (await fetch(attach.url)).arrayBuffer());

      const img = sharp(buffer);
      const meta = await img.metadata();

      const wMarkBuffer = await sharp(path.join(__dirname,
        logo === "2" ? "watermark2.png" :
        logo === "3" ? "watermark3.png" :
        "watermark.png"
      ))
        .resize({ width: Math.floor(meta.width * 0.06) })
        .toBuffer();

      const wMeta = await sharp(wMarkBuffer).metadata();

      const margin = 20;
      let top = 0;
      let left = 0;

      const position = pos || "southeast";

      switch (position) {
        case "northwest":
          top = margin;
          left = margin;
          break;
        case "northeast":
          top = margin;
          left = meta.width - wMeta.width - margin;
          break;
        case "southwest":
          top = meta.height - wMeta.height - margin;
          left = margin;
          break;
        case "southeast":
          top = meta.height - wMeta.height - margin;
          left = meta.width - wMeta.width - margin;
          break;
        case "center":
        case "centre":
          top = (meta.height - wMeta.height) / 2;
          left = (meta.width - wMeta.width) / 2;
          break;
        case "north":
          top = margin;
          left = (meta.width - wMeta.width) / 2;
          break;
        case "south":
          top = meta.height - wMeta.height - margin;
          left = (meta.width - wMeta.width) / 2;
          break;
        default:
          top = meta.height - wMeta.height - margin;
          left = meta.width - wMeta.width - margin;
      }

      const out = await img.composite([{
        input: wMarkBuffer,
        top: Math.round(top),
        left: Math.round(left)
      }]).toBuffer();

      await interaction.editReply({
        files: [new AttachmentBuilder(out, { name: "prime.png" })]
      });

    } catch (e) {
      console.error(e);
      await interaction.editReply("❌ Erreur watermark");
    }
  }

  // ===== DEVIS (TON DESIGN CONSERVÉ) =====
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

    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 800, 1000);

    ctx.fillStyle = "#111";
    ctx.font = "bold 40px Roboto";
    ctx.fillText("DEVIS", 320, 80);

    ctx.font = "24px Roboto";
    ctx.fillText(`Client : ${data.client}`, 50, 150);
    ctx.fillText(`Téléphone : ${data.telephone}`, 50, 190);
    ctx.fillText(`Photos : ${data.photos}`, 50, 230);

    ctx.fillText("Description :", 50, 300);

    const words = data.description.split(" ");
    let line = "";
    let y = 340;

    for (let word of words) {
      const testLine = line + word + " ";
      if (ctx.measureText(testLine).width > 700) {
        ctx.fillText(line, 50, y);
        line = word + " ";
        y += 30;
      } else line = testLine;
    }
    ctx.fillText(line, 50, y);

    ctx.font = "bold 30px Roboto";
    ctx.fillText(`TOTAL : $${data.prix}`, 50, 800);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sign_${id}`).setLabel("Signer").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuse_${id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      files: [new AttachmentBuilder(canvas.toBuffer(), { name: "devis.png" })],
      components: [row]
    });
  }

  // ===== SIGNATURE =====
  if (interaction.isButton() && interaction.customId.startsWith("sign_")) {

    const id = interaction.customId.split("_")[1];
    const data = devisCache.get(id);

    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 800, 1000);

    ctx.fillStyle = "#111";
    ctx.font = "bold 40px Roboto";
    ctx.fillText("DEVIS", 320, 80);

    ctx.font = "24px Roboto";
    ctx.fillText(`Client : ${data.client}`, 50, 150);
    ctx.fillText(`Téléphone : ${data.telephone}`, 50, 190);
    ctx.fillText(`Photos : ${data.photos}`, 50, 230);

    ctx.fillText("Description :", 50, 300);

    let y = 340;
    let line = "";
    for (let word of data.description.split(" ")) {
      const testLine = line + word + " ";
      if (ctx.measureText(testLine).width > 700) {
        ctx.fillText(line, 50, y);
        line = word + " ";
        y += 30;
      } else line = testLine;
    }
    ctx.fillText(line, 50, y);

    ctx.font = "bold 30px Roboto";
    ctx.fillText(`TOTAL : $${data.prix}`, 50, 800);

    ctx.font = "28px Dancing";
    ctx.fillText(
      interaction.member.nickname || interaction.user.username,
      500,
      900
    );

    ctx.font = "18px Roboto";
    ctx.fillText(
      `Signé le ${new Date().toLocaleDateString()}`,
      500,
      930
    );

    devisCache.delete(id);

    return interaction.update({
      files: [new AttachmentBuilder(canvas.toBuffer(), { name: "signed.png" })],
      components: []
    });
  }

  if (interaction.isButton() && interaction.customId.startsWith("refuse_")) {
    await interaction.message.delete().catch(() => {});
  }

  // ===== DISPO =====
  if (interaction.isButton()) {

    await interaction.deferReply({ flags: 64 });

    const member = interaction.member;
    const status = interaction.customId === "dispo_on" ? "🟢" : "🔴";

    if (interaction.channelId === PHOTO_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === PHOTO_ROLE)) {
        return interaction.editReply("❌ Tu n'es pas photographe.");
      }
      photoStatuses[userId] = status;
    }

    else if (interaction.channelId === MODEL_CHANNEL_ID) {
      if (!member.roles.cache.some(r => r.name === MODEL_ROLE)) {
        return interaction.editReply("❌ Tu n'es pas modèle.");
      }
      modelStatuses[userId] = status;
    }

    else return;

    saveStatuses({ photoStatuses, modelStatuses });
    await refreshAll();

    return interaction.editReply("✅ Statut mis à jour");
  }

});

client.login(TOKEN);
