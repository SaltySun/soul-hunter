// Actor Sheet Classes
class HunterActorSheet extends ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["soul-hunter", "sheet", "actor"],
            template: "systems/soul-hunter/templates/actor/character-sheet.hbs",
            width: 700,
            height: 800,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".tab-content", initial: "main" }]
        });
    }

    async getData(options) {
        const data = await super.getData(options);
        data.system = this.actor.system;
        
        // 准备技能数据，包含属性关联
        data.skills = {};
        for (let [key, skill] of Object.entries(this.actor.system.skills || {})) {
            const attributeValue = this.actor.system.attributes[skill.attribute]?.value || 3;
            data.skills[key] = {
                ...skill,
                attributeValue: attributeValue,
                attributeDice: `${attributeValue}d4`
            };
        }
        
        // 计算战斗数值
        const physiqueValue = this.actor.system.attributes.physique.value;
        const intellectValue = this.actor.system.attributes.intellect.value;
        const spiritValue = this.actor.system.attributes.spirit.value;
        
        // 武艺强度基础为运动一半向下取整
        const athleticsValue = this.actor.system.skills.athletics.value;
        const martialPowerBase = Math.floor(athleticsValue / 2);
        
        // 术法强度为智慧的一半
        const spellPowerBase = Math.floor(intellectValue / 2);
        
        // 零能力强度为心魄的一半
        const soulPowerBase = Math.floor(spiritValue / 2);
        
        // 更新战斗数值显示
        data.combatValues = {
            martialPower: martialPowerBase,
            spellPower: spellPowerBase,
            soulPower: soulPowerBase
        };
        
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // 技能掷骰
        html.find("[data-action=roll]").on("click", this._onSkillRoll.bind(this));
        
        // 物品管理
        html.find(".item-create").on("click", this._onItemCreate.bind(this));
        html.find(".item-edit").on("click", this._onItemEdit.bind(this));
        html.find(".item-delete").on("click", this._onItemDelete.bind(this));
        
        // 资源管理
        html.find(".resource-bar input").on("change", this._onResourceChange.bind(this));
    }

    async _onSkillRoll(event) {
        event.preventDefault();
        const skill = event.currentTarget.dataset.skill;
        const skillData = this.actor.system.skills[skill];
        const attributeValue = this.actor.system.attributes[skillData.attribute].value;
        
        // 根据新规则计算属性加成
        let attributeBonus = "";
        let attributeDescription = "";
        
        if (skill === "athletics") {
            // 运动：体魄等级一半的D4向下取整
            const physiqueValue = this.actor.system.attributes.physique.value;
            const bonusDice = Math.floor(physiqueValue / 2);
            if (bonusDice > 0) {
                attributeBonus = ` + ${bonusDice}d4`;
                attributeDescription = `(体魄${physiqueValue}，加成${bonusDice}d4)`;
            }
        } else if (skill === "operation" || skill === "stealth" || skill === "investigation") {
            // 操作、隐秘、调查：智慧的一半
            const intellectValue = this.actor.system.attributes.intellect.value;
            const bonusDice = Math.floor(intellectValue / 2);
            if (bonusDice > 0) {
                attributeBonus = ` + ${bonusDice}d4`;
                attributeDescription = `(智慧${intellectValue}，加成${bonusDice}d4)`;
            }
        } else if (skill === "insight" || skill === "persuasion") {
            // 洞察、说服：心魄的一半
            const spiritValue = this.actor.system.attributes.spirit.value;
            const bonusDice = Math.floor(spiritValue / 2);
            if (bonusDice > 0) {
                attributeBonus = ` + ${bonusDice}d4`;
                attributeDescription = `(心魄${spiritValue}，加成${bonusDice}d4)`;
            }
        }
        
        // 构建基础掷骰公式：1d20 + 技能等级 + 属性加成
        const rollFormula = `1d20 + ${skillData.value}${attributeBonus}`;
        
        // 时髦值等级选择弹窗
        const currentStyleValue = this.actor.system.resources.style.value;
        let styleDice = "";
        let styleLevel = 0;
        
        const styleChoice = await Dialog.wait({
            title: "时髦值等级选择",
            content: `
                <div class="style-choice">
                    <p>请选择本次检定的时髦等级：</p>
                    <p>当前时髦值：${currentStyleValue}/100</p>
                </div>
            `,
            buttons: {
                none: {
                    label: "不使用时髦值",
                    callback: () => 0
                },
                level1: {
                    label: "等级1 (+1d6)",
                    callback: () => 1
                },
                level2: {
                    label: "等级2 (+2d6)",
                    callback: () => 2
                },
                level3: {
                    label: "等级3 (+3d6)",
                    callback: () => 3
                }
            }
        });
        
        styleLevel = styleChoice || 0;
        
        if (styleLevel > 0) {
            styleDice = ` + ${styleLevel}d6`;
        }
        
        const finalFormula = rollFormula + styleDice;
        const roll = await new Roll(finalFormula).roll();
        
        // 如果使用了时髦值，计算时髦值骰子的结果并添加到角色卡
        let styleGained = 0;
        if (styleLevel > 0) {
            // 从掷骰结果中提取时髦值骰子的结果
            const styleRoll = await new Roll(`${styleLevel}d6`).roll();
            styleGained = styleRoll.total;
            
            // 更新角色卡的时髦值（不超过100）
            const newStyleValue = Math.min(100, currentStyleValue + styleGained);
            await this.actor.update({"system.resources.style.value": newStyleValue});
        }
        
        const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `${skillData.label} 检定 ${attributeDescription}`,
            rolls: [roll],
            content: `<div class="dice-roll">
                <div class="dice-result">
                    <div class="dice-formula">${finalFormula}</div>
                    <div class="dice-total">${roll.total}</div>
                </div>
                ${styleGained > 0 ? `<div class="style-gained">时髦值获得：+${styleGained}</div>` : ''}
            </div>`
        };
        
        ChatMessage.create(messageData);
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const type = event.currentTarget.dataset.type;
        const itemData = {
            name: `新${this._getItemTypeName(type)}`,
            type: type,
            system: {}
        };
        
        const item = await Item.create(itemData, { parent: this.actor });
        item.sheet.render(true);
    }

    _onItemEdit(event) {
        event.preventDefault();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) {
            item.sheet.render(true);
        }
    }

    async _onItemDelete(event) {
        event.preventDefault();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) {
            const confirmed = await Dialog.confirm({
                title: "删除物品",
                content: `<p>确定要删除 <strong>${item.name}</strong> 吗？</p>`,
                defaultYes: false
            });
            
            if (confirmed) {
                await item.delete();
            }
        }
    }

    async _onResourceChange(event) {
        event.preventDefault();
        const input = event.currentTarget;
        const value = parseInt(input.value);
        const max = parseInt(input.max);
        
        // 确保值不超过最大值
        if (max && value > max) {
            input.value = max;
        }
    }

    _getItemTypeName(type) {
        const typeNames = {
            martial: "武技",
            spell: "术法",
            talent: "专长",
            soulweapon: "灵魂武器",
            consumable: "道具",
            ultimate: "绝技"
        };
        return typeNames[type] || type;
    }
}

// Item Sheet Classes
class HunterItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["soul-hunter", "sheet", "item"],
            width: 500,
            height: 400
        });
    }

    get template() {
        return `systems/soul-hunter/templates/item/${this.item.type}-sheet.hbs`;
    }

    async getData(options) {
        const data = await super.getData(options);
        data.system = this.item.system;
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // 如果是武技或术法，添加使用按钮功能
        if (this.item.type === "martial" || this.item.type === "spell") {
            html.find(".use-item").on("click", this._onUseItem.bind(this));
        }
    }

    async _onUseItem(event) {
        event.preventDefault();
        // 实现物品使用逻辑
        const actor = this.item.parent;
        if (!actor) return;
        
        // 检查消耗
        const consumption = this.item.system.consumption;
        if (consumption && consumption.type !== "none" && consumption.value > 0) {
            const resourcePath = `system.resources.${consumption.type}.value`;
            const currentValue = foundry.utils.getProperty(actor, resourcePath);
            
            if (currentValue < consumption.value) {
                ui.notifications.warn(`${consumption.type}不足！`);
                return;
            }
            
            // 消耗资源
            const newValue = Math.max(0, currentValue - consumption.value);
            await actor.update({ [resourcePath]: newValue });
        }
        
        // 发送使用消息到聊天
        const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: `<div class="hunter-item-use">
                <h3>${this.item.name}</h3>
                <p>${this.item.system.description || "使用了物品"}</p>
            </div>`
        };
        
        ChatMessage.create(messageData);
    }
}

// NPC Sheet
class HunterNPCSheet extends ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["soul-hunter", "sheet", "actor", "npc"],
            template: "systems/soul-hunter/templates/actor/npc-sheet.hbs",
            width: 500,
            height: 600
        });
    }

    async getData(options) {
        const data = await super.getData(options);
        data.system = this.actor.system;
        return data;
    }
}

// Dice Rolling Utilities
class HunterDice {
    static async rollAttribute(actor, attributeName) {
        const attribute = actor.system.attributes[attributeName];
        const modifier = Math.floor(attribute.value / 2) - 1;
        const roll = await new Roll(`1d20 + ${modifier}`).roll();
        
        const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            flavor: `${attribute.label || attributeName} 属性检定`,
            rolls: [roll]
        };
        
        ChatMessage.create(messageData);
        return roll;
    }

    static async rollDamage(formula, actor, flavor = "伤害") {
        const roll = await new Roll(formula).roll();
        
        const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            flavor: flavor,
            rolls: [roll]
        };
        
        ChatMessage.create(messageData);
        return roll;
    }
}

// System Initialization
Hooks.once("init", async function () {
    console.log("Hunter of Souls | 初始化系统");
    
    // 配置系统设置
    CONFIG.HunterSouls = {
        skills: {
            athletics: { label: "运动", attribute: "physique" },
            operation: { label: "操作", attribute: "physique" },
            stealth: { label: "隐秘", attribute: "physique" },
            investigation: { label: "调查", attribute: "intellect" },
            insight: { label: "洞察", attribute: "intellect" },
            persuasion: { label: "说服", attribute: "spirit" },
            soulhunting: { label: "狩魂学识", attribute: "spirit" }
        },
        attributes: {
            physique: { label: "体魄" },
            intellect: { label: "智慧" },
            spirit: { label: "心魂" }
        }
    };
    
    // 加载模板
    await loadTemplates([
        "systems/soul-hunter/templates/actor/character-sheet.hbs",
        "systems/soul-hunter/templates/actor/npc-sheet.hbs",
        "systems/soul-hunter/templates/item/martial-sheet.hbs",
        "systems/soul-hunter/templates/item/spell-sheet.hbs",
        "systems/soul-hunter/templates/item/talent-sheet.hbs",
        "systems/soul-hunter/templates/item/soulweapon-sheet.hbs",
        "systems/soul-hunter/templates/item/consumable-sheet.hbs",
        "systems/soul-hunter/templates/item/ultimate-sheet.hbs"
    ]);
    
    // 注册Actor表单
    Actors.registerSheet("soul-hunter", HunterActorSheet, { 
        types: ["character"], 
        makeDefault: true,
        label: "狩魂者角色表单"
    });
    
    Actors.registerSheet("soul-hunter", HunterNPCSheet, { 
        types: ["npc", "monster"], 
        makeDefault: true,
        label: "NPC/怪物表单"
    });
    
    // 注册Item表单
    Items.registerSheet("soul-hunter", HunterItemSheet, { 
        makeDefault: true,
        label: "狩魂者物品表单"
    });
    
    // 暴露全局工具类
    window.HunterDice = HunterDice;
});

// 准备数据时的钩子
Hooks.once("ready", async function () {
    console.log("Hunter of Souls | 系统就绪");
});

// 聊天消息钩子，用于处理特殊掷骰
Hooks.on("renderChatMessage", (message, html, data) => {
    // 可以在这里添加聊天消息的特殊处理
});

// 导出类供其他模块使用
export { HunterActorSheet, HunterItemSheet, HunterNPCSheet, HunterDice };