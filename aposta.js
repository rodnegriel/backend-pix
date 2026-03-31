const { 
    ApplicationCommandType, 
    ApplicationCommandOptionType, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    StringSelectMenuBuilder
} = require("discord.js");
const { General, Emojis } = require("../../Database");

module.exports = {
    name: "apostar",
    description: "⚡ | Crie uma Aposta.",
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "tipo",
            description: "Escolha o tipo de fila (Tático, Emulador, Mobile, Misto)",
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: 'Tático', value: 'tatico' },
                { name: 'Emulador', value: 'emulador' },
                { name: 'Mobile', value: 'mobile' },
                { name: 'Misto', value: 'misto' }
            ]
        },
        {
            name: "modo",
            description: "Escolha o modo da partida (1v1, 2v2, 3v3, 4v4)",
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: '1v1', value: '1v1' },
                { name: '2v2', value: '2v2' },
                { name: '3v3', value: '3v3' },
                { name: '4v4', value: '4v4' }
            ]
        },
        {
            name: "valor",
            description: "Defina o valor da fila (ex: 2,10 ou 2.10)",
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: "orientador",
            description: "Selecione o orientador da fila",
            type: ApplicationCommandOptionType.User,
            required: true
        }
    ],
    run: async (client, interaction) => {
        if (interaction.user.id !== General.get('Creator')) {
            const embed = new EmbedBuilder()
                .setDescription(`${Emojis.get('Errado')} | Você não possui permissão para utilizar esse comando.`)
                .setColor(General.get('Cor').Error || '#F59133');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const tipoFila = interaction.options.getString('tipo');
        const modo = interaction.options.getString('modo');
        const valorFila = parseFloat(interaction.options.getString('valor').replace(',', '.'));
        const orientador = interaction.options.getUser('orientador');
        const chavePix = General.get("ChavePix");

        const maxPlayers = parseInt(modo.split('v')[0]);
        const usersInQueue = new Set();
        const activePayments = new Map();
        let teamA = [];
        let teamB = [];
        let gameStarted = false;

        const updateEmbed = () => {
            const teamAText = teamA.length > 0 ? teamA.map(user => `<@${user.id}>`).join('\n') : 'Vazio';
            const teamBText = teamB.length > 0 ? teamB.map(user => `<@${user.id}>`).join('\n') : 'Vazio';
            const totalPlayers = teamA.length + teamB.length;
            const isFull = totalPlayers >= maxPlayers * 2;
            const participantsText = [...teamA, ...teamB].map(user => `<@${user.id}>`).join('\n') || `\`Nenhum participante\``;

            const embed = new EmbedBuilder()
                .setTitle(gameStarted ? 'Apostado Começou' : `Aposta Criada: ${tipoFila}`)
                .setColor(General.get('Cor').Success || '#33F5FF')
                .addFields(
                    { name: 'Time A', value: teamAText, inline: true },
                    { name: 'Time B', value: teamBText, inline: true }
                )
                .setTimestamp();

            if (gameStarted) {
                embed.setDescription(`Orientador iniciou o apostado, peço que todos os participantes aguardem ele! <@${orientador.id}>`);
            } else {
                embed.setDescription(`**Modo escolhido**: ${modo}\n**Valor da fila**: R$${valorFila.toFixed(2)}\n**Orientador**: <@${orientador.id}>\n`);
            }
/*
\n${isFull ? '✅ Fila Completa!' : 'Clique no botão abaixo para entrar na fila!'}
*/
            return embed;
        };

        const createButtons = (isFull) => {
            const row = new ActionRowBuilder();
            
            if (!gameStarted) {
                if (!isFull) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId('entrar_fila')
                            .setLabel('Entrar na Fila')
                            .setStyle(2)
                    );
                } else {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId('iniciar_apostado')
                            .setLabel('Iniciar Apostado')
                            .setStyle(3)
                    );
                }
            }
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('cancelar_fila')
                    .setLabel('Cancelar Fila')
                    .setStyle(4)
            );
            
            return row;
        };

        const initialMessage = await interaction.reply({ 
            embeds: [updateEmbed()], 
            components: [createButtons(false)] 
        });

        const filter = i => ['entrar_fila', 'cancelar_fila', 'iniciar_apostado'].includes(i.customId);
        const collector = interaction.channel.createMessageComponentCollector({ filter });

        collector.on('collect', async (i) => {
            if (i.customId === 'iniciar_apostado') {
                if (i.user.id !== orientador.id) {
                    return i.reply({ content: `${Emojis.get('Alerta')} | Apenas o orientador pode iniciar o apostado!`, ephemeral: true });
                }

                gameStarted = true;
                await i.update({ 
                    embeds: [updateEmbed()],
                    components: [createButtons(true)]
                });
            } else if (i.customId === 'entrar_fila') {
                if (usersInQueue.has(i.user.id)) {
                    return i.reply({ content: `${Emojis.get('Alerta')} | Você já está na fila!`, ephemeral: true });
                }

                if (activePayments.has(i.user.id)) {
                    const paymentChannel = activePayments.get(i.user.id);
                    return i.reply({ content: `${Emojis.get('Alerta')} | Você já tem um canal de pagamento pendente! ${paymentChannel}`, ephemeral: true });
                }

                const category = interaction.channel.parent;
                const channel = await category.guild.channels.create({
                    name: `💲-pagamento-${i.user.username}`,
                    type: 0,
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            id: i.user.id,
                            allow: ['ViewChannel', 'SendMessages']
                        },
                        {
                            id: category.guild.roles.everyone.id,
                            deny: ['ViewChannel']
                        }
                    ]
                });

                activePayments.set(i.user.id, channel.toString());

                i.reply({ content: `👋 | Olá ${i.user}, para entrar na fila realize o pagamento neste canal: ${channel}`, ephemeral: true });

                const pagamentoEmbed = new EmbedBuilder()
                    .setTitle('Pagamento Pendente')
                    .setDescription(`Efetue o pagamento para confirmar sua entrada na fila.\n\nChave PIX: \`${chavePix}\`\nValor: R$${valorFila.toFixed(2)}`)
                    .setColor('#FFD700')
                    .setTimestamp();

                const approveButton = new ButtonBuilder()
                    .setCustomId('aprovar_pagamento')
                    .setLabel('Aprovar Pagamento')
                    .setStyle(3);

                const paymentRow = new ActionRowBuilder().addComponents(approveButton);

                await channel.send({ embeds: [pagamentoEmbed], components: [paymentRow] });

                const paymentCollector = channel.createMessageComponentCollector({
                    filter: m => m.customId === 'aprovar_pagamento' && m.user.id === orientador.id,
                    time: 300000
                });

                paymentCollector.on('collect', async (m) => {
                    paymentCollector.stop();
                    approveButton.setLabel('Pagamento Aprovado!').setDisabled(true);
                    await m.update({ components: [new ActionRowBuilder().addComponents(approveButton)] });

                    const teamSelectMenu = new StringSelectMenuBuilder()
                        .setCustomId('selecionar_time')
                        .setPlaceholder('Escolha o time que deseja entrar')
                        .addOptions(
                            { label: 'Time A', value: 'team_a', description: `${teamA.length}/${maxPlayers} jogadores` },
                            { label: 'Time B', value: 'team_b', description: `${teamB.length}/${maxPlayers} jogadores` }
                        );

                    const teamRow = new ActionRowBuilder().addComponents(teamSelectMenu);

                    const teamEmbed = new EmbedBuilder()
                        .setTitle('Selecione seu Time')
                        .setDescription('Escolha o time que deseja entrar para completar o processo.')
                        .setColor('#33F5FF');

                    await channel.send({ embeds: [teamEmbed], components: [teamRow] });

                    const teamCollector = channel.createMessageComponentCollector({ 
                        filter: t => t.customId === 'selecionar_time',
                        time: 300000 
                    });

                    teamCollector.on('collect', async (t) => {
                        if (t.user.id !== i.user.id) {
                            return t.reply({ 
                                content: `${Emojis.get('Lupa')} | Detectamos que você não é o usuário <@${i.user.id}>`,
                                ephemeral: true 
                            });
                        }

                        const team = t.values[0] === 'team_a' ? teamA : teamB;
                        
                        if (team.length >= maxPlayers) {
                            return t.reply({ 
                                content: `${Emojis.get('Alerta')} | O time escolhido está cheio!`, 
                                ephemeral: true 
                            });
                        }

                        team.push(i.user);
                        usersInQueue.add(i.user.id);
                        activePayments.delete(i.user.id);

                        const totalPlayers = teamA.length + teamB.length;
                        const isFull = totalPlayers >= maxPlayers * 2;

                        await interaction.editReply({ 
                            embeds: [updateEmbed()],
                            components: [createButtons(isFull)]
                        });

                        await t.reply({
                            content: `**💪 | Você selecionou o \`${t.values[0].replace('team_', 'Time ').toUpperCase()}\`, boa sorte!\n-# Este canal vai ser apagado em 10 segundos...**`
                        });

                        setTimeout(async () => {
                            await channel.delete().catch(() => {});
                        }, 10000);
                    });
                });
            } else if (i.customId === 'cancelar_fila') {
                if (i.user.id !== orientador.id && i.user.id !== General.get('Creator')) {
                    return i.reply({ content: "${Emojis.get('Alerta')} | Apenas o orientador ou o criador podem cancelar a fila!", ephemeral: true });
                }

                const participantsText = [...teamA, ...teamB].map(user => `<@${user.id}>`).join('\n') || 'Nenhum participante';

                const cancelEmbed = new EmbedBuilder()
                    .setTitle(`Apostado Cancelada: ${tipoFila}`)
                    .setDescription(`📢 | Aposta cancelada por: <@${i.user.id}>`)
                    .addFields(
                        { name: 'Participantes', value: participantsText }
                    )
                    .setColor(General.get('Cor').Error || '#F59133')
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
                collector.stop();

                for (const [userId, channelMention] of activePayments) {
                    const channel = interaction.guild.channels.cache.find(
                        ch => ch.toString() === channelMention
                    );
                    if (channel) {
                        await channel.delete().catch(() => {});
                    }
                }
            }
        });
    }
};