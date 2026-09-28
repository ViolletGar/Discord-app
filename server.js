require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Welcome settings are saved locally so they survive restarts/redeploys
// only when the hosting service keeps the project filesystem.
const dataDir = path.join(__dirname, "data");
const welcomeFile = path.join(dataDir, "welcome.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(welcomeFile)) fs.writeFileSync(welcomeFile, "{}");

function loadWelcomeSettings() {
  try {
    return JSON.parse(fs.readFileSync(welcomeFile, "utf8"));
  } catch {
    return {};
  }
}

function saveWelcomeSettings(data) {
  fs.writeFileSync(welcomeFile, JSON.stringify(data, null, 2));
}

const commands = [
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement embed")
    .addStringOption(o =>
      o.setName("title").setDescription("Announcement title").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message").setDescription("Announcement message").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot send a message")
    .addStringOption(o =>
      o.setName("message").setDescription("Message to send").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set the channel used for automatic welcomes")
    .addChannelOption(o =>
      o
        .setName("channel")
        .setDescription("Welcome channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Send a welcome message manually")
    .addUserOption(o =>
      o.setName("member").setDescription("Member to welcome").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete recent messages")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add a role to a member")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role").setDescription("Role to add").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("removerole")
    .setDescription("Remove a role from a member")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role").setDescription("Role to remove").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create a private ticket channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Send a custom embed")
    .addStringOption(o =>
      o.setName("title").setDescription("Embed title").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("description").setDescription("Embed description").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("New commands registered successfully!");
}

function welcomeEmbed(member) {
  return new EmbedBuilder()
    .setTitle("Welcome to void hall")
    .setDescription(
      `Welcome ${member}!\n\nWe're glad to have you here. Enjoy your stay!`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();
}

client.once("ready", async () => {
  console.log(`Bot online as ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Command registration error:", error);
  }
});

client.on("guildMemberAdd", async (member) => {
  const settings = loadWelcomeSettings();
  const channelId = settings[member.guild.id];
  if (!channelId) return;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  try {
    await channel.send({ embeds: [welcomeEmbed(member)] });
  } catch (error) {
    console.error("Automatic welcome error:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "announce") {
      const title = interaction.options.getString("title", true);
      const message = interaction.options.getString("message", true);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      return interaction.reply({ content: "Announcement sent.", ephemeral: true });
    }

    if (interaction.commandName === "say") {
      const message = interaction.options.getString("message", true);
      await interaction.channel.send({ content: message });
      return interaction.reply({ content: "Sent.", ephemeral: true });
    }

    if (interaction.commandName === "setwelcome") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = loadWelcomeSettings();
      settings[interaction.guild.id] = channel.id;
      saveWelcomeSettings(settings);

      return interaction.reply({
        content: `Welcome channel set to ${channel}.`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "welcome") {
      const member = interaction.options.getMember("member");
      if (!member) {
        return interaction.reply({
          content: "That member is not available in this server.",
          ephemeral: true,
        });
      }

      const settings = loadWelcomeSettings();
      const channelId = settings[interaction.guild.id];

      if (!channelId) {
        return interaction.reply({
          content: "Set a welcome channel first with /setwelcome.",
          ephemeral: true,
        });
      }

      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content: "The saved welcome channel is no longer available.",
          ephemeral: true,
        });
      }

      await channel.send({ embeds: [welcomeEmbed(member)] });
      return interaction.reply({
        content: `Welcome message sent in ${channel}.`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "clear") {
      const amount = interaction.options.getInteger("amount", true);
      const deleted = await interaction.channel.bulkDelete(amount, true);

      return interaction.reply({
        content: `Deleted ${deleted.size} message(s).`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "addrole") {
      const member = interaction.options.getMember("member");
      const role = interaction.options.getRole("role", true);

      if (!member) {
        return interaction.reply({
          content: "That member is not available in this server.",
          ephemeral: true,
        });
      }

      if (role.managed) {
        return interaction.reply({
          content: "I can't manually assign a managed/integration role.",
          ephemeral: true,
        });
      }

      await member.roles.add(role);
      return interaction.reply({
        content: `Added ${role} to ${member}.`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "removerole") {
      const member = interaction.options.getMember("member");
      const role = interaction.options.getRole("role", true);

      if (!member) {
        return interaction.reply({
          content: "That member is not available in this server.",
          ephemeral: true,
        });
      }

      await member.roles.remove(role);
      return interaction.reply({
        content: `Removed ${role} from ${member}.`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "ticket") {
      const guild = interaction.guild;
      const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText &&
          c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20)}`
      );

      if (existing) {
        return interaction.reply({
          content: `You already have a ticket: ${existing}`,
          ephemeral: true,
        });
      }

      const safeName =
        `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20) || interaction.user.id.slice(-6)}`;

      const channel = await guild.channels.create({
        name: safeName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      await channel.send(
        `Welcome ${interaction.user}! A staff member will help you here.`
      );

      return interaction.reply({
        content: `Ticket created: ${channel}`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "embed") {
      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description", true);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      return interaction.reply({ content: "Embed sent.", ephemeral: true });
    }
  } catch (error) {
    console.error(`/${interaction.commandName} error:`, error);

    const reply = {
      content: "Something went wrong. Check the bot permissions and logs.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(TOKEN);
