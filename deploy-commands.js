const { REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1476563110662766644";
const GUILD_ID = "1403500050067230730";

const commands = [
  {
    name: 'dispo',
    description: 'Changer sa disponibilité Photographe',
    options: [{
      name: 'etat',
      description: 'ON ou OFF',
      type: 3,
      required: true,
      choices: [
        { name: 'ON', value: 'on' },
        { name: 'OFF', value: 'off' }
      ]
    }]
  },
  {
    name: 'modeldispo',
    description: 'Changer sa disponibilité Prime Model',
    options: [{
      name: 'etat',
      description: 'ON ou OFF',
      type: 3,
      required: true,
      choices: [
        { name: 'ON', value: 'on' },
        { name: 'OFF', value: 'off' }
      ]
    }]
  },
  {
    name: 'addmoney',
    description: 'Ajouter de l’argent',
    options: [{
      name: 'amount',
      description: 'Montant',
      type: 4,
      required: true
    }]
  },
  {
    name: 'removemoney',
    description: 'Retirer de l’argent',
    options: [{
      name: 'amount',
      description: 'Montant',
      type: 4,
      required: true
    }]
  },
  {
    name: 'money',
    description: 'Voir le solde'
  },
  {
    name: 'watermark',
    description: 'Ajouter un filigrane à une image',
    options: [
      {
        name: 'image',
        description: 'Image à modifier',
        type: 11,
        required: true
      },
      {
        name: 'position',
        description: 'Position du filigrane',
        type: 3,
        required: true,
        choices: [
          { name: "Centre", value: "center" },
          { name: "Bas Droite", value: "bottom-right" },
          { name: "Bas Gauche", value: "bottom-left" },
          { name: "Haut Droite", value: "top-right" },
          { name: "Haut Gauche", value: "top-left" },
          { name: "Milieu Haut", value: "top-center" },
          { name: "Milieu Bas", value: "bottom-center" }
        ]
      },
      {
        name: 'logo',
        description: 'Choisir le logo',
        type: 3,
        required: true,
        choices: [
          { name: "Logo Prime Network™ Entier", value: "1" },
          { name: "Logo Prime Network™ Flat Design", value: "2" },
          { name: "Antivol", value: "3" }
        ]
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  console.log("🔄 Installation des commandes...");
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ Commandes installées");
})();