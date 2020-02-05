'use strict';

const Contact = require('./Contact');
const Base = require('./Base');
const MessageMedia = require('./MessageMedia');

/**
 * Represents a Message on WhatsApp
 * @extends {Base}
 */
class Message extends Base {
    constructor(client, data) {
        super(client);

        if(data) this._patch(data);
    }

    _patch(data) {
        /**
         * ID that represents the message
         * @type {object}
         */
        this.id = data.id;

        /**
         * Indicates if the message has media available for download
         * @type {boolean}
         */
        this.hasMedia = data.clientUrl ? true : false;

        /**
         * Message content
         * @type {string}
         */
        this.body = this.hasMedia ? data.caption || '' : data.body || '';

        /** 
         * Message type
         * @type {MessageTypes}
         */
        this.type = data.type;

        /**
         * Unix timestamp for when the message was created
         * @type {number}
         */
        this.timestamp = data.t;

        /**
         * ID for the Chat that this message was sent to, except if the message was sent by the current user.
         * @type {string}
         */
        this.from = typeof (data.from) === 'object' ? data.from._serialized : data.from;

        /**
         * ID for who this message is for.
         * 
         * If the message is sent by the current user, it will be the Chat to which the message is being sent.
         * If the message is sent by another user, it will be the ID for the current user. 
         * @type {string}
         */
        this.to = typeof (data.to) === 'object' ? data.to._serialized : data.to;

        /**
         * If the message was sent to a group, this field will contain the user that sent the message.
         * @type {string}
         */
        this.author = typeof (data.author) === 'object' ? data.author._serialized : data.author;

        /**
         * Indicates if the message was forwarded
         * @type {boolean}
         */
        this.isForwarded = data.isForwarded;

        /**
         * Indicates if the message was a broadcast
         * @type {boolean}
         */
        this.broadcast = data.broadcast;

        /** 
         * Indicates if the message was sent by the current user
         * @type {boolean}
         */
        this.fromMe = data.id.fromMe;
        
        /**
         * Indicates if the message was sent as a reply to another message.
         * @type {boolean}
         */
        this.hasQuotedMsg = data.quotedMsg ? true : false;

        /**
         * Indicates if the message body contained any mentions.
         * @type {[id]}
         */
        this.mentions = [];

        if (data.mentionedJidList) {
            this.mentions = data.mentionedJidList
        }

        return super._patch(data);
    }

    _getChatId() {
        return this.fromMe ? this.to : this.from;
    }

    /**
     * Returns the Chat this message was sent in
     * @returns {Promise<Chat>}
     */
    getChat() {
        return this.client.getChatById(this._getChatId());
    }

    /**
     * Returns the Contact this message was sent from
     * @returns {Promise<Contact>}
     */
    getContact() {
        return this.client.getContactById(this._getChatId());
    }

    /**
     * Returns the Contacts mentioned in this message
     * @returns {[Promise<Contact>]}
     */
    async getMentions() {
        let mentions = [];
        for (let i = 0; i < this.mentions.length; i++) {
            let contact = await this.client.getContactById(this.mentions[i]);
            mentions.push(contact)
        }
        return mentions;
    }

    /**
     * Returns the quoted message, if any
     * @returns {Promise<Message>}
     */
    async getQuotedMessage() {
        if (!this.hasQuotedMsg) return undefined;

        const quotedMsg = await this.client.pupPage.evaluate((msgId) => {
            let msg = window.Store.Msg.get(msgId);
            return msg.quotedMsgObj().serialize();
        }, this.id._serialized);

        return new Message(this.client, quotedMsg);
    }

    /**
     * Sends a message as a reply to this message. If chatId is specified, it will be sent 
     * through the specified Chat. If not, it will send the message 
     * in the same Chat as the original message was sent.
     * 
     * @param {string|MessageMedia} content 
     * @param {?string} chatId 
     * @param {object} options
     * @returns {Promise<Message>}
     */
    async reply(content, chatId, options={}) {
        if (!chatId) {
            chatId = this._getChatId();
        }

        options = {
            ...options,
            quotedMessageId: this.id._serialized
        };

        return this.client.sendMessage(chatId, content, options);
    }

    /**
     * Downloads and returns the attatched message media
     * @returns {Promise<MessageMedia>}
     */
    async downloadMedia() {
        if (!this.hasMedia) {
            return undefined;
        }

        const {data, mimetype, filename} = await this.client.pupPage.evaluate(async (msgId) => {
            const msg = window.Store.Msg.get(msgId);
            const buffer = await window.WWebJS.downloadBuffer(msg.clientUrl);
            const decrypted = await window.Store.CryptoLib.decryptE2EMedia(msg.type, buffer, msg.mediaKey, msg.mimetype);
            const data = await window.WWebJS.readBlobAsync(decrypted._blob);
            
            return {
                data: data.split(',')[1],
                mimetype: msg.mimetype,
                filename: msg.filename
            };

        }, this.id._serialized);

        return new MessageMedia(mimetype, data, filename);
    }
}

module.exports = Message;