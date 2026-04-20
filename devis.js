const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('devis')
    .setDescription('Créer un devis')
    .addStringOption(option => option.setName('client').setDescription('Nom du client').setRequired(true))
    .addStringOption(option => option.setName('telephone').setDescription('Téléphone').setRequired(true))
    .addStringOption(option => option.setName('photographe').setDescription('Nom du photographe').setRequired(true))
    .addIntegerOption(option => option.setName('photos').setDescription('Nombre de photos').setRequired(true))
    .addStringOption(option => option.setName('description').setDescription('Description').setRequired(true))
    .addIntegerOption(option => option.setName('prix').setDescription('Prix').setRequired(true)),

  async execute(interaction) {

    const client = interaction.options.getString('client');
    const telephone = interaction.options.getString('telephone');
    const photographe = interaction.options.getString('photographe');
    const photos = interaction.options.getInteger('photos');
    const description = interaction.options.getString('description');
    const prix = interaction.options.getInteger('prix');

    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext('2d');

    const background = await loadImage('./devis_template.png');
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#000";
    ctx.font = "28px Arial";

    ctx.fillText(client, 250, 220);
    ctx.fillText(telephone, 250, 270);
    ctx.fillText(photographe, 250, 320);
    ctx.fillText(String(photos), 250, 370);
    ctx.fillText(description, 250, 420);
    ctx.fillText(`${prix} €`, 250, 470);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'devis.png' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${client}`)
        .setLabel('Accepter')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`refuse_${client}`)
        .setLabel('Refuser')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      content: `📄 Devis pour **${client}**`,
      files: [attachment],
      components: [row]
    });
  }
};