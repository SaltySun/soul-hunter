// Actor Sheet Classes
class HunterActorSheet extends ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["soul-hunter", "sheet", "actor"],
            template: "systems/soul-hunter/templates/actor/character-sheet.hbs",
            width: 700,
            height: 900,
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
        
        // 武艺强度基础为体魄一半向下取整
        const martialPowerBase = Math.floor(physiqueValue / 2);
        
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
        
        // 如果战斗数值未设置，使用计算值初始化
        if (this.actor.system.combat.martialpower.value === 0) {
            await this.actor.update({"system.combat.martialpower.value": martialPowerBase});
        }
        if (this.actor.system.combat.spellpower.value === 0) {
            await this.actor.update({"system.combat.spellpower.value": spellPowerBase});
        }
        if (this.actor.system.combat.soulpower.value === 0) {
            await this.actor.update({"system.combat.soulpower.value": soulPowerBase});
        }
        
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // 技能掷骰
        html.find("[data-action=roll]").on("click", this._onSkillRoll.bind(this));
        // 时髦动作
        html.find(".style-action").on("click", this._onStyleAction.bind(this));
        
        // 重置战斗数值
        html.find(".reset-combat-values").on("click", this._onResetCombatValues.bind(this));
        
        // 物品管理
        html.find(".item-create-popup").on("click", this._onItemCreatePopup.bind(this));
        html.find(".item-edit").on("click", this._onItemEdit.bind(this));
        html.find(".item-delete").on("click", this._onItemDelete.bind(this));
        // 物品图片发送到聊天
        html.find(".items-list .item-entry .item-name img").on("click", this._onItemImageToChat.bind(this));
        
        // 弹窗管理
        html.find(".popup-close").on("click", this._onPopupClose.bind(this));
        html.find(".item-type-option").on("click", this._onItemTypeSelect.bind(this));
        
        // 灵能力标签与使用
        html.find(".power-tag-add").on("click", this._onPowerTagAdd.bind(this));
        html.find(".power-tag").on("contextmenu", this._onPowerTagRemove.bind(this));
        html.find(".use-power").on("click", this._onUsePower.bind(this));

        // 从角色卡直接使用武技/术法
        html.find(".use-martial").on("click", this._onUseMartial.bind(this));
        html.find(".use-spell").on("click", this._onUseSpell.bind(this));

        // 资源管理
        html.find(".resource-bar input").on("change", this._onResourceChange.bind(this));
    }

    async _onStyleAction(event) {
        event.preventDefault();
        const current = this.actor.system.resources.style.value || 0;
        const actions = [
            { key: "awakening", label: "超灵觉醒", cost: 30 },
            { key: "finale", label: "英雄谢幕", cost: 15 },
            { key: "tenacity", label: "坚毅", cost: 15 },
            { key: "flashback", label: "闪回", cost: 15 },
            { key: "reroll", label: "重投", cost: 15 },
            { key: "powerful", label: "强力", cost: 10 }
        ];
        
        const content = `
            <div class="style-choice">
                <p>当前时髦值：${current}/100</p>
                <div class="style-options">
                    ${actions.map(a => `<button type="button" data-key="${a.key}" ${current < a.cost ? 'disabled' : ''}>${a.label}（消耗 ${a.cost}）</button>`).join("")}
                </div>
            </div>
        `;
        
        let selected = null;
        await Dialog.wait({
            title: "使用时髦动作",
            content,
            buttons: {
                cancel: { label: "取消", callback: () => null }
            },
            render: (html) => {
                html.find(".style-options button").on("click", (ev) => {
                    const key = ev.currentTarget.dataset.key;
                    selected = actions.find(a => a.key === key);
                    // 触发关闭
                    html.find("button:contains('取消')").click();
                });
            }
        });
        
        if (!selected) return;
        if (current < selected.cost) {
            ui.notifications.warn("时髦值不足");
            return;
        }
        // 扣减
        await this.actor.update({ "system.resources.style.value": Math.max(0, current - selected.cost) });
        
        // 发布聊天信息
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<div class="hunter-dice-roll">
                <div class="dice-header">
                    <div class="dice-formula">时髦动作：${selected.label}</div>
                </div>
                <div class="dice-result">
                    <div class="dice-total">-${selected.cost}</div>
                    <div class="success-level success">已使用</div>
                </div>
            </div>`
        });
    }

    async _onResetCombatValues(event) {
        event.preventDefault();
        
        // 重新计算战斗数值
        const physiqueValue = this.actor.system.attributes.physique.value;
        const intellectValue = this.actor.system.attributes.intellect.value;
        const spiritValue = this.actor.system.attributes.spirit.value;
        
        const martialPowerBase = Math.floor(physiqueValue / 2);
        const spellPowerBase = Math.floor(intellectValue / 2);
        const soulPowerBase = Math.floor(spiritValue / 2);
        
        // 更新战斗数值
        await this.actor.update({
            "system.combat.martialpower.value": martialPowerBase,
            "system.combat.spellpower.value": spellPowerBase,
            "system.combat.soulpower.value": soulPowerBase
        });
        
        ui.notifications.info("战斗数值已重置为计算值");
    }

    async _onSkillRoll(event) {
        event.preventDefault();
        const skill = event.currentTarget.dataset.skill;
        const skillData = this.actor.system.skills[skill];
        if (!skillData) return;

        // 每个技能等级 +1d4（不再平加等级）
        const skillLevel = Number(skillData.value) || 0;
        const skillDice = skillLevel > 0 ? `${skillLevel}d4` : "";

        // 属性加成为对应主属性的一半个d4（向下取整）
        const attrKey = skillData.attribute;
        let attributeDescription = "";
        let attributeDice = "";
        if (attrKey && this.actor.system.attributes[attrKey]) {
            const val = Number(this.actor.system.attributes[attrKey].value) || 0;
            const bonusCount = Math.floor(val / 2);
            if (bonusCount > 0) {
                attributeDice = `${bonusCount}d4`;
                const label = CONFIG.HunterSouls?.attributes?.[attrKey]?.label || attrKey;
                attributeDescription = `（${label}${val}，+${bonusCount}d4）`;
            }
        }

        const parts = ["1d20", skillDice, attributeDice].filter(Boolean);
        const baseRoll = await new Roll(parts.join(" + ")).roll();

        // 时髦值等级选择（只加骰不增减资源）
        const currentStyleValue = this.actor.system.resources.style.value || 0;
        const styleLevel = await Dialog.wait({
            title: "时髦值等级选择",
            content: `<div class="style-choice"><p>当前时髦值：${currentStyleValue}/100</p></div>`,
            buttons: {
                none: { label: "不使用时髦值", callback: () => 0 },
                level1: { label: "等级1 (+1d6)", callback: () => 1 },
                level2: { label: "等级2 (+2d6)", callback: () => 2 },
                level3: { label: "等级3 (+3d6)", callback: () => 3 }
            }
        }) || 0;

        const styleRoll = styleLevel > 0 ? await new Roll(`${styleLevel}d6`).roll() : null;
        // 使用时髦值自动累计
        if (styleRoll) {
            const currStyle = Number(this.actor.system.resources.style.value) || 0;
            const newStyle = Math.min(100, currStyle + styleRoll.total);
            await this.actor.update({ "system.resources.style.value": newStyle });
        }
        const total = baseRoll.total + (styleRoll ? styleRoll.total : 0);

        const successLevel = Math.floor((total - 10) / 5);
        const successText = successLevel > 0 ? `成功等级 ${successLevel}` : total >= 10 ? "成功" : "失败";

        const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `${skillData.label} 检定 ${attributeDescription}`,
            rolls: [baseRoll].concat(styleRoll ? [styleRoll] : []),
            content: `<div class="hunter-dice-roll">
                <div class="dice-header">
                    <div class="dice-formula">${parts.join(" + ")}${styleRoll ? ` + ${styleLevel}d6` : ""}</div>
                </div>
                <div class="dice-total-result">
                    <div class="dice-total">${total}</div>
                    <div class="success-level ${total >= 10 ? 'success' : 'failure'}">${successText}</div>
                </div>
                <details class="dice-collapsible"><summary>查看骰子详情</summary>
                    <div class="dice-details">${await baseRoll.render()}${styleRoll ? await styleRoll.render() : ''}</div>
                </details>
            </div>`
        };

        ChatMessage.create(messageData);
    }

    async _onItemImageToChat(event) {
        event.preventDefault();
        const itemId = event.currentTarget.closest('.item-entry')?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        const system = item.system || {};
        const desc = typeof system.description === 'string' ? system.description : '';
        const content = `<div class="hunter-item-post">
            <div class="item-header"><img src="${item.img}" style="width:28px;height:28px;border:1px solid #666;margin-right:6px;vertical-align:middle;"/> <strong>${item.name}</strong> <em>(${item.type})</em></div>
            ${desc ? `<div class="item-body">${desc}</div>` : ''}
        </div>`;
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
    }

    async _onPowerTagAdd(event) {
        event.preventDefault();
        const current = this.actor.system.power?.tags || "";
        let tag = null;
        await new Promise((resolve)=>{
            new Dialog({
                title: "添加专精标签",
                content: `<p>输入标签：</p><input type="text" id="power-tag-input"/>`,
                buttons: {
                    ok: { label: "添加", callback: (html)=>{ tag = html.find('#power-tag-input').val(); resolve(); }},
                    cancel: { label: "取消", callback: ()=>resolve() }
                }
            }).render(true);
        });
        if (!tag) return;
        const tags = current ? current.split(',').map(t=>t.trim()).filter(Boolean) : [];
        if (!tags.includes(tag)) tags.push(tag);
        await this.actor.update({ 'system.power.tags': tags.join(', ') });
        this.render(true);
    }

    async _onPowerTagRemove(event) {
        event.preventDefault();
        const tag = event.currentTarget.dataset.tag;
        const current = this.actor.system.power?.tags || "";
        const tags = current ? current.split(',').map(t=>t.trim()).filter(Boolean) : [];
        const idx = tags.indexOf(tag);
        if (idx < 0) return;
        const yes = await Dialog.confirm({ title: '删除标签', content: `<p>确认删除标签：<strong>${tag}</strong>？</p>` });
        if (!yes) return;
        tags.splice(idx,1);
        await this.actor.update({ 'system.power.tags': tags.join(', ') });
        this.render(true);
    }

    async _onUsePower(event) {
        event.preventDefault();
        const power = this.actor.system.power || {};
        const rawTags = (power.tags || '').split(',').map(t=>t.trim()).filter(Boolean);
        let selected = [];
        let extraTags = 0;
        await Dialog.wait({
            title: '使用灵能力 - 选择标签',
            content: `<div class="tag-select">${rawTags.map(t=>`<button type="button" class="tag-btn" data-tag="${t}">${t}</button>`).join('')}</div>
                      <div style="margin-top:8px;"><label>额外标签数量：</label> <input type="number" id="extra-tags" value="0" min="0" style="width:80px;"/></div>`,
            buttons: { ok: { label: '确定', callback: (html)=>{ extraTags = Number(html.find('#extra-tags').val()||0); return true; } }, cancel: { label: '取消', callback: ()=>false } },
            render: (html)=>{
                html.find('.tag-btn').on('click', (ev)=>{
                    const t = ev.currentTarget.dataset.tag;
                    if (selected.includes(t)) {
                        selected = selected.filter(x=>x!==t);
                        ev.currentTarget.classList.remove('active');
                    } else {
                        selected.push(t);
                        ev.currentTarget.classList.add('active');
                    }
                });
            }
        });

        const currentStyleValue = this.actor.system.resources.style.value || 0;
        const styleLevel = await Dialog.wait({
            title: '时髦值等级选择',
            content: `<p>当前时髦值：${currentStyleValue}/100</p>`,
            buttons: {
                none: { label: '不使用', callback: ()=>0 },
                l1: { label: '等级1 (+1d6)', callback: ()=>1 },
                l2: { label: '等级2 (+2d6)', callback: ()=>2 },
                l3: { label: '等级3 (+3d6)', callback: ()=>3 }
            }
        }) || 0;

        const tagDiceCount = selected.length;
        const soulPower = Math.floor(Number(this.actor.system.combat.soulpower.value) || 0);
        const baseRoll = await new Roll(`1d20${tagDiceCount>0?` + ${tagDiceCount}d4`:''}${extraTags>0?` + ${extraTags}d4`:''}${soulPower>0?` + ${soulPower}d4`:''}`).roll();
        const styleRoll = styleLevel>0 ? await new Roll(`${styleLevel}d6`).roll() : null;
        // 灵能力使用后自动消耗灵力值：每确认一个标签 -1 MP
        if (tagDiceCount > 0) {
            const currMP = Number(this.actor.system.resources.mp.value) || 0;
            const newMP = Math.max(0, currMP - tagDiceCount);
            await this.actor.update({ "system.resources.mp.value": newMP });
        }
        // 使用时髦值自动累计
        if (styleRoll) {
            const currStyle = Number(this.actor.system.resources.style.value) || 0;
            const newStyle = Math.min(100, currStyle + styleRoll.total);
            await this.actor.update({ "system.resources.style.value": newStyle });
        }
        const total = baseRoll.total + (styleRoll?styleRoll.total:0);
        const successLevel = Math.floor((total - 10) / 5);
        const successText = successLevel > 0 ? `成功等级 ${successLevel}` : total >= 10 ? "成功" : "失败";

        const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `使用灵能力：${power.name || ''}（标签：${selected.join(', ') || '无'}）`,
            rolls: [baseRoll].concat(styleRoll?[styleRoll]:[]),
            content: `<div class=\"hunter-dice-roll\">\n                <div class=\"dice-header\"><div class=\"dice-formula\">1d20${tagDiceCount>0?` + ${tagDiceCount}d4`:''}${extraTags>0?` + ${extraTags}d4`:''}${soulPower>0?` + ${soulPower}d4`:''}${styleRoll?` + ${styleLevel}d6`:''}</div></div>\n                <div class=\"dice-result\"><div class=\"dice-total\">${total}</div><div class=\"success-level ${total>=10?'success':'failure'}\">${successText}</div></div>\n                <details class=\"dice-collapsible\"><summary>查看骰子详情</summary>${await baseRoll.render()}${styleRoll?await styleRoll.render():''}</details>\n                <div class=\"note\">标签 ${tagDiceCount}（扣MP）、额外标签 ${extraTags}（不扣资源）、灵能力强度 ${soulPower}d4；时髦值已自动累计。</div>\n            </div>`
        };
        ChatMessage.create(messageData);
    }

    async _onUseMartial(event) {
        event.preventDefault();
        const martials = this.actor.items.filter(i=>i.type==='martial');
        if (martials.length === 0) { ui.notifications.info('没有可用的武技'); return; }
        let chosenId = null;
        await Dialog.wait({
            title: '选择武技',
            content: `<div>${martials.map(i=>`<button type=\"button\" class=\"martial-opt\" data-id=\"${i.id}\">${i.name}</button>`).join('')}</div>`,
            buttons: { cancel: { label: '取消', callback: ()=>null } },
            render: (html)=>{ html.find('.martial-opt').on('click', (ev)=>{ chosenId = ev.currentTarget.dataset.id; html.closest('.app').find('button:contains("取消")').click(); }); }
        });
        if (!chosenId) return;
        const extra = await Dialog.wait({ title:'额外标签', content:'<p>额外标签数量（不消耗资源，每个+1d4）：</p><input type="number" id="x" value="0" min="0" style="width:80px;"/>', buttons:{ ok:{label:'确定', callback:(html)=>Number(html.find('#x').val()||0)}, cancel:{label:'取消', callback:()=>0} } })||0;
        const currentStyleValue = this.actor.system.resources.style.value || 0;
        const styleLevel = await Dialog.wait({ title:'时髦值等级选择', content:`<p>当前时髦值：${currentStyleValue}/100</p>`, buttons:{ none:{label:'不使用', callback:()=>0}, l1:{label:'等级1 (+1d6)', callback:()=>1}, l2:{label:'等级2 (+2d6)', callback:()=>2}, l3:{label:'等级3 (+3d6)', callback:()=>3} } })||0;
        const martialPower = Math.floor(Number(this.actor.system.combat.martialpower.value)||0);
        const baseRoll = await new Roll(`1d20${martialPower>0?` + ${martialPower}d4`:''}${extra>0?` + ${extra}d4`:''}`).roll();
        const styleRoll = styleLevel>0 ? await new Roll(`${styleLevel}d6`).roll() : null;
        if (styleRoll) { const curr = Number(this.actor.system.resources.style.value)||0; await this.actor.update({ 'system.resources.style.value': Math.min(100, curr + styleRoll.total) }); }
        const total = baseRoll.total + (styleRoll?styleRoll.total:0);
        const successLevel = Math.floor((total - 10) / 5);
        const successText = successLevel > 0 ? `成功等级 ${successLevel}` : total >= 10 ? '成功' : '失败';
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor:`使用武技`, rolls:[baseRoll].concat(styleRoll?[styleRoll]:[]), content:`<div class=\"hunter-dice-roll\"><div class=\"dice-header\"><div class=\"dice-formula\">1d20${martialPower>0?` + ${martialPower}d4`:''}${extra>0?` + ${extra}d4`:''}${styleRoll?` + ${styleLevel}d6`:''}</div></div><div class=\"dice-result\"><div class=\"dice-total\">${total}</div><div class=\"success-level ${total>=10?'success':'failure'}\">${successText}</div></div><details class=\"dice-collapsible\"><summary>查看骰子详情</summary>${await baseRoll.render()}${styleRoll?await styleRoll.render():''}</details><div class=\"note\">武技强度 ${martialPower}d4；额外标签 ${extra}（不消耗资源）</div></div>` });
    }

    async _onUseSpell(event) {
        event.preventDefault();
        const spells = this.actor.items.filter(i=>i.type==='spell');
        if (spells.length === 0) { ui.notifications.info('没有可用的术法'); return; }
        let chosenId = null;
        await Dialog.wait({
            title: '选择术法',
            content: `<div>${spells.map(i=>`<button type=\"button\" class=\"spell-opt\" data-id=\"${i.id}\">${i.name}</button>`).join('')}</div>`,
            buttons: { cancel: { label: '取消', callback: ()=>null } },
            render: (html)=>{ html.find('.spell-opt').on('click', (ev)=>{ chosenId = ev.currentTarget.dataset.id; html.closest('.app').find('button:contains("取消")').click(); }); }
        });
        if (!chosenId) return;
        const extra = await Dialog.wait({ title:'额外标签', content:'<p>额外标签数量（不消耗资源，每个+1d4）：</p><input type="number" id="x" value="0" min="0" style="width:80px;"/>', buttons:{ ok:{label:'确定', callback:(html)=>Number(html.find('#x').val()||0)}, cancel:{label:'取消', callback:()=>0} } })||0;
        const currentStyleValue = this.actor.system.resources.style.value || 0;
        const styleLevel = await Dialog.wait({ title:'时髦值等级选择', content:`<p>当前时髦值：${currentStyleValue}/100</p>`, buttons:{ none:{label:'不使用', callback:()=>0}, l1:{label:'等级1 (+1d6)', callback:()=>1}, l2:{label:'等级2 (+2d6)', callback:()=>2}, l3:{label:'等级3 (+3d6)', callback:()=>3} } })||0;
        const spellPower = Math.floor(Number(this.actor.system.combat.spellpower.value)||0);
        const baseRoll = await new Roll(`1d20${spellPower>0?` + ${spellPower}d4`:''}${extra>0?` + ${extra}d4`:''}`).roll();
        const styleRoll = styleLevel>0 ? await new Roll(`${styleLevel}d6`).roll() : null;
        if (styleRoll) { const curr = Number(this.actor.system.resources.style.value)||0; await this.actor.update({ 'system.resources.style.value': Math.min(100, curr + styleRoll.total) }); }
        const total = baseRoll.total + (styleRoll?styleRoll.total:0);
        const successLevel = Math.floor((total - 10) / 5);
        const successText = successLevel > 0 ? `成功等级 ${successLevel}` : total >= 10 ? '成功' : '失败';
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor:`使用术法`, rolls:[baseRoll].concat(styleRoll?[styleRoll]:[]), content:`<div class=\"hunter-dice-roll\"><div class=\"dice-header\"><div class=\"dice-formula\">1d20${spellPower>0?` + ${spellPower}d4`:''}${extra>0?` + ${extra}d4`:''}${styleRoll?` + ${styleLevel}d6`:''}</div></div><div class=\"dice-result\"><div class=\"dice-total\">${total}</div><div class=\"success-level ${total>=10?'success':'failure'}\">${successText}</div></div><details class=\"dice-collapsible\"><summary>查看骰子详情</summary>${await baseRoll.render()}${styleRoll?await styleRoll.render():''}</details><div class=\"note\">术法强度 ${spellPower}d4；额外标签 ${extra}（不消耗资源）</div></div>` });
    }

    

    _onItemCreatePopup(event) {
        event.preventDefault();
        const popup = document.getElementById('item-type-popup');
        if (popup) {
            popup.style.display = 'flex';
        }
    }

    _onPopupClose(event) {
        event.preventDefault();
        const popup = document.getElementById('item-type-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }

    async _onItemTypeSelect(event) {
        event.preventDefault();
        const type = event.currentTarget.dataset.type;
        const popup = document.getElementById('item-type-popup');
        if (popup) {
            popup.style.display = 'none';
        }
        
        const itemData = {
            name: `新${this._getItemTypeName(type)}`,
            type: type,
            system: {}
        };
        
        const item = await Item.create(itemData, { parent: this.actor });
        item.sheet.render(true);
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

        // 点击物品图片将物品内容发送到聊天
        html.find(".item-img").on("click", this._onPostToChat.bind(this));
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

    async _onPostToChat(event) {
        event.preventDefault();
        const system = this.item.system || {};
        const desc = typeof system.description === 'string' ? system.description : '';
        const content = `<div class="hunter-item-post">
            <div class="item-header"><img src="${this.item.img}" style="width:28px;height:28px;border:1px solid #666;margin-right:6px;vertical-align:middle;"/> <strong>${this.item.name}</strong> <em>(${this.item.type})</em></div>
            ${desc ? `<div class=\"item-body\">${desc}</div>` : ''}
        </div>`;
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.item.parent }), content });
    }
}

// NPC Sheet
class HunterNPCSheet extends ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["soul-hunter", "sheet", "actor", "npc"],
            template: "systems/soul-hunter/templates/actor/npc-sheet.hbs",
            width: 500,
            height: 820
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
    
    // Handlebars 助手
    if (typeof Handlebars !== 'undefined') {
        Handlebars.registerHelper('split', function(str, sep){
            if (!str) return [];
            return String(str).split(sep);
        });
        Handlebars.registerHelper('trim', function(str){
            if (!str) return '';
            return String(str).trim();
        });
    }

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
    // 处理掷骰详情的展开/收起
    html.find(".toggle-details").on("click", (event) => {
        event.preventDefault();
        const button = event.currentTarget;
        const details = button.closest(".hunter-dice-roll").querySelector(".dice-details");
        const icon = button.querySelector("i");
        
        if (details.style.display === "none") {
            details.style.display = "block";
            icon.className = "fas fa-chevron-up";
            button.innerHTML = '<i class="fas fa-chevron-up"></i> 收起详情';
        } else {
            details.style.display = "none";
            icon.className = "fas fa-chevron-down";
            button.innerHTML = '<i class="fas fa-chevron-down"></i> 查看详情';
        }
    });
});

// 在场景工具栏添加骰点工具
Hooks.on('getSceneControlButtons', (controls) => {
    const tokenControls = controls.find(c => c.name === 'token');
    if (!tokenControls) return;
    tokenControls.tools.push({
        name: 'soul-hunter-dice-tool',
        title: '骰点工具',
        icon: 'fas fa-dice',
        button: true,
        onClick: async () => {
            let d4 = 0, d6 = 0, target = 10;
            await Dialog.wait({
                title: '骰点工具',
                content: `
                    <div class="dice-tool-form">
                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                            <label style="min-width:70px;">D4 个数</label>
                            <input type="number" id="dice-d4" value="0" min="0" style="width:80px;"/>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                            <label style="min-width:70px;">D6 个数</label>
                            <input type="number" id="dice-d6" value="0" min="0" style="width:80px;"/>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <label style="min-width:70px;">对抗值</label>
                            <input type="number" id="target" value="10" min="0" style="width:80px;"/>
                        </div>
                    </div>
                `,
                buttons: {
                    roll: {
                        label: '投掷',
                        callback: (html) => {
                            d4 = Number(html.find('#dice-d4').val() || 0);
                            d6 = Number(html.find('#dice-d6').val() || 0);
                            target = Number(html.find('#target').val() || 10);
                            return true;
                        }
                    },
                    cancel: { label: '取消', callback: () => false }
                }
            });

            const parts = ["1d20"]; 
            if (d4 > 0) parts.push(`${d4}d4`);
            if (d6 > 0) parts.push(`${d6}d6`);
            const baseRoll = await new Roll(parts.join(" + ")).roll();
            const total = baseRoll.total;
            const successLevel = Math.floor((total - target) / 5);
            const successText = successLevel > 0 ? `成功等级 ${successLevel}` : total >= target ? '成功' : '失败';

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: game.user?.character }),
                flavor: `骰点工具：1d20${d4>0?` + ${d4}d4`:''}${d6>0?` + ${d6}d6`:''} 对抗 ${target}`,
                rolls: [baseRoll],
                content: `<div class=\"hunter-dice-roll\">\n                    <div class=\"dice-header\"><div class=\"dice-formula\">${parts.join(' + ')} vs ${target}</div></div>\n                    <div class=\"dice-total-result\"><div class=\"dice-total\">${total}</div><div class=\"success-level ${total>=target?'success':'failure'}\">${successText}</div></div>\n                    <details class=\"dice-collapsible\"><summary>查看骰子详情</summary>${await baseRoll.render()}</details>\n                </div>`
            });
        }
    });
});

// 导出类供其他模块使用
export { HunterActorSheet, HunterItemSheet, HunterNPCSheet, HunterDice };