const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const API_URL = 'https://api.scyted.tv/v2/loydshelper/games/tic-tac-toe/conclusions.json';
const API_KEY = process.env.SCYTEDTV_API;

const games = new Map();

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'game' && interaction.options.getSubcommand() === 'tic-tac-toe') {
        const opponent = interaction.options.getUser('user');

        if (opponent.bot) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('<:crossmark:1330976664535961753> `You cannot play against a bot.`')
                ],
             ephemeral: true });
        }
        if (opponent.id === interaction.user.id) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('<:crossmark:1330976664535961753> `You cannot play against yourself.`')
                ],
             ephemeral: true });
        }
        if (games.has(`${interaction.guildId}-${interaction.channelId}`)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('<:crossmark:1330976664535961753> `A game is already in progress.`')
                ],
             ephemeral: true });
        }

        const gameId = `${interaction.guildId}-${interaction.channelId}`;
        const gameState = {
            players: [opponent.id, interaction.user.id],
            turn: opponent.id,
            board: Array(9).fill(null),
            winner: null
        };

        games.set(gameId, gameState);
        await sendGameBoard(interaction, gameState);
    }
});

async function sendGameBoard(interaction, gameState) {
    const embed = new EmbedBuilder()
        .setTitle('Tic-Tac-Toe')
        .setDescription(`<@${gameState.turn}>'s turn.`)
        .setColor(gameState.turn === gameState.players[0] ? 'Blue' : 'Red');

    const buttons = generateBoardButtons(gameState, false);
    await interaction.reply({ embeds: [embed], components: buttons });
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [_, row, col] = interaction.customId.split('-').map(Number);
    const gameId = `${interaction.guildId}-${interaction.channelId}`;
    const gameState = games.get(gameId);

    if (!gameState) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('<:crossmark:1330976664535961753> `This game has timed out.`')
            ],
         ephemeral: true });
    }
    if (interaction.user.id !== gameState.turn) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('<:crossmark:1330976664535961753> `It\'s not your turn.`')
            ],
         ephemeral: true });
    }

    const index = row * 3 + col;
    if (gameState.board[index] !== null) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('<:crossmark:1330976664535961753> `That spot is already taken.`')
            ],
         ephemeral: true });
    }

    gameState.board[index] = gameState.turn === gameState.players[0] ? 'X' : 'O';
    gameState.turn = gameState.players.find(player => player !== gameState.turn);

    const winner = checkWinner(gameState.board);
    if (winner) {
        gameState.winner = winner === 'X' ? gameState.players[0] : gameState.players[1];
        await updateStats(gameState.winner, 'win');
        await updateStats(gameState.players.find(p => p !== gameState.winner), 'lose');
        await endGame(interaction, gameState);
    } else if (!gameState.board.includes(null)) {
        gameState.winner = 'Tie';
        await updateStats(gameState.players[0], 'win');
        await updateStats(gameState.players[1], 'win');
        await endGame(interaction, gameState);
    } else {
        await updateGameBoard(interaction, gameState);
    }
});

async function updateGameBoard(interaction, gameState) {
    const embed = new EmbedBuilder()
        .setTitle('Tic-Tac-Toe')
        .setDescription(`<@${gameState.turn}>'s turn.`)
        .setColor(gameState.turn === gameState.players[0] ? 'Blue' : 'Red');

    const buttons = generateBoardButtons(gameState, false);
    await interaction.update({ embeds: [embed], components: buttons });
}

async function endGame(interaction, gameState) {
    const embed = new EmbedBuilder()
        .setTitle('Tic-Tac-Toe')
        .setColor('Green');

    if (gameState.winner === 'Tie') {
        embed.setDescription('The game ended in a tie!');
    } else {
        embed.setDescription(`<@${gameState.winner}> has won the game!`);
    }

    const buttons = generateBoardButtons(gameState, true);
    games.delete(`${interaction.guildId}-${interaction.channelId}`);
    await interaction.update({ embeds: [embed], components: buttons });
}

function generateBoardButtons(gameState, disableAll) {
    return [0, 1, 2].map(row =>
        new ActionRowBuilder().addComponents(
            [0, 1, 2].map(col => {
                const index = row * 3 + col;
                const label = gameState.board[index] === null ? '?' : gameState.board[index];

                return new ButtonBuilder()
                    .setCustomId(`move-${row}-${col}`)
                    .setLabel(label)
                    .setStyle(
                        gameState.board[index] === 'X' ? ButtonStyle.Primary :
                        gameState.board[index] === 'O' ? ButtonStyle.Danger :
                        ButtonStyle.Secondary
                    )
                    .setDisabled(disableAll || gameState.board[index] !== null);
            })
        )
    );
}

async function updateStats(userId, type) {
    try {
        const response = await axios.get(API_URL, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
        const stats = response.data;
        const userStats = stats[userId] || { wins: 0, losses: 0 };

        if (type === 'win') {
            userStats.wins += 1;
        } else if (type === 'lose') {
            userStats.losses += 1;
        }

        const updatedStats = { ...stats, [userId]: userStats };
        await axios.post(API_URL, updatedStats, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
    } catch (error) {
        console.error(`Failed to update stats for ${userId}:`, error);
    }
}

function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of winPatterns) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}