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
const DEVIS_CHANNEL_ID = "1466817112252219558";

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

// ===== READY =====
client.once("ready", async () => {
  console.log("✅ Bot prêt");
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async interaction => {

  const userId = interaction.user.id;

  // ===== WATERMARK =====
  if (interaction.isChatInputCommand() && interaction.commandName === "watermark") {

    if (interaction.channelId !== WATERMARK_CHANNEL_ID)
      return interaction.reply({ content: "❌ Mauvais salon", flags: 64 });

    await interaction.deferReply();

    const attach = interaction.options.getAttachment("image");
    const pos = interaction.options.getString("position");

    try {
      const buffer = Buffer.from(await (await fetch(attach.url)).arrayBuffer());

      const img = sharp(buffer);
      const meta = await img.metadata();

      const wMarkBuffer = await sharp("watermark.png")
        .resize({ width: Math.floor(meta.width * 0.035) })
        .toBuffer();

      const wMeta = await sharp(wMarkBuffer).metadata();

      const marginX = Math.floor(meta.width * 0.01);
      const marginY = Math.floor(meta.height * 0.01);

      let top = 0;
      let left = 0;

      switch ((pos || "southeast")) {
        case "southwest":
          top = meta.height - wMeta.height - marginY;
          left = marginX;
          break;
        case "southeast":
          top = meta.height - wMeta.height - marginY;
          left = meta.width - wMeta.width - marginX;
          break;
      }

      const out = await img.composite([{
        input: wMarkBuffer,
        top,
        left
      }]).toBuffer();

      await interaction.editReply({
        files: [new AttachmentBuilder(out, { name: "prime.png" })]
      });

    } catch {
      await interaction.editReply("❌ Erreur watermark");
    }
  }

  // ===== DEVIS =====
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

    // DESIGN
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 800, 1000);

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 800, 120);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 42px Roboto";
    ctx.fillText("DEVIS", 50, 70);

    ctx.font = "20px Roboto";
    ctx.fillText("Prime Studio", 50, 100);

    ctx.fillStyle = "#fff";
    ctx.fillRect(40, 140, 720, 140);
    ctx.strokeRect(40, 140, 720, 140);

    ctx.fillStyle = "#111";
    ctx.font = "bold 22px Roboto";
    ctx.fillText("CLIENT", 60, 170);

    ctx.font = "20px Roboto";
    ctx.fillText(`Nom : ${data.client}`, 60, 210);
    ctx.fillText(`Téléphone : ${data.telephone}`, 60, 240);
    ctx.fillText(`Photos : ${data.photos}`, 60, 270);

    ctx.fillRect(40, 720, 720, 100);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px Roboto";
    ctx.fillText(`TOTAL : $${data.prix}`, 60, 780);

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
    ctx.fillRect(0, 0, 800, 120);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 42px Roboto";
    ctx.fillText("DEVIS", 50, 70);

    ctx.font = "20px Roboto";
    ctx.fillText("Prime Studio", 50, 100);

    ctx.fillStyle = "#111";
    ctx.font = "20px Roboto";
    ctx.fillText("Signature :", 60, 900);

    ctx.font = "28px Dancing";
    ctx.fillText(interaction.user.username, 200, 900);

    devisCache.delete(id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`send_mp_${id}`).setLabel("📩 MP").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`send_channel_${id}`).setLabel("📤 Channel").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`send_both_${id}`).setLabel("📤📩 Les deux").setStyle(ButtonStyle.Success)
    );

    return interaction.update({
      files: [new AttachmentBuilder(canvas.toBuffer(), { name: "signed.png" })],
      components: [row]
    });
  }

  // ===== ENVOI =====
  if (interaction.isButton() && interaction.customId.startsWith("send_")) {

    const file = interaction.message.attachments.first();
    const id = interaction.customId.split("_")[2];
    const data = devisCache.get(id);

    const clientUser = interaction.user;

    // MP avec message
    if (interaction.customId.startsWith("send_mp")) {
      await clientUser.send({
        content: `Merci pour votre confiance chez Prime Network™ 🙏\nNous espérons vous revoir très bientôt !`,
        files: [file]
      });
    }

    // Channel avec infos
    if (interaction.customId.startsWith("send_channel")) {
      const channel = await client.channels.fetch(DEVIS_CHANNEL_ID);
      await channel.send({
        content: `${data?.client} | ${data?.telephone}`,
        files: [file]
      });
    }

    // Les deux
    if (interaction.customId.startsWith("send_both")) {
      const channel = await client.channels.fetch(DEVIS_CHANNEL_ID);

      await channel.send({
        content: `${data?.client} | ${data?.telephone}`,
        files: [file]
      });

      await clientUser.send({
        content: `Merci pour votre confiance chez Prime Network™ 🙏\nNous espérons vous revoir très bientôt !`,
        files: [file]
      });
    }

    await interaction.reply({ content: "✅ Envoyé !", flags: 64 });
  }

});

client.login(TOKEN);
