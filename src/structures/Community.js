'use strict';

const GroupChat = require('./GroupChat');

/**
 * Chat ID structure
 * @typedef {Object} ChatId
 * @property {string} server
 * @property {string} user
 * @property {string} _serialized
 */

/**
 * Represents a Community on WhatsApp
 * @extends {GroupChat}
 */
class Community extends GroupChat {
    _patch(data) {
        this.groupMetadata = data.groupMetadata;
        this.isCommunity = true;

        return super._patch(data);
    }

    /**
     * Gets all current community subgroups
     * @returns {Promise<Array<ChatId>>} Returns an array of @type {ChatId} objects
     */
    async getSubgroups() {
        return await this.client.pupPage.evaluate((communityId) => {
            const communityWid = window.Store.WidFactory.createWid(communityId);
            return window.Store.CommunityUtils.getSubgroups(communityWid);
        }, this.id._serialized);
    }

    /**
     * An object that handles the result for {@link linkSubgroups} method
     * @typedef {Object} LinkSubGroupsResult
     * @property {Array<string>} linkedGroupIds An array of group IDs that were successfully linked
     * @property {Array<Object>} failedGroups An array of objects that handles groups that failed to be linked to the community and an information about it
     * @property {string} failedGroups[].groupId The group ID, in a format of 'xxxxxxxxxx@g.us'
     * @property {number} failedGroups[].error The code of an error
     * @property {string} failedGroups[].message The message that describes an error
     */

    /**
     * Links a single subgroup or an array of subgroups to the community
     * @param {string} parentGroupId The ID of a community parent group
     * @param {string|Array<string>} subGroupIds The single group ID or an array of group IDs to link to the created community
     * @returns {Promise<LinkSubGroupsResult>} Returns an object that handles the result for the linking subgroups action
     */
    async linkSubgroups(parentGroupId, subGroupIds) {
        return await this.client.pupPage.evaluate(
            async (parentGroupId, subGroupIds) => {
                return await window.WWebJS.linkUnlinkSubgroups('LinkSubgroups', parentGroupId, subGroupIds);
            },
            parentGroupId,
            subGroupIds
        );
    }

    /**
     * An object that handles the result for {@link unlinkSubgroups} method
     * @typedef {Object} UnlinkSubGroupsResult
     * @property {Array<string>} unlinkedGroupIds An array of group IDs that were successfully unlinked
     * @property {Array<Object>} failedGroups An array of objects that handles groups that failed to be unlinked from the community and an information about it
     * @property {string} failedGroups[].groupId The group ID, in a format of 'xxxxxxxxxx@g.us'
     * @property {number} failedGroups[].error The code of an error
     * @property {string} failedGroups[].message The message that describes an error
     */

    /**
     * Links a single subgroup or an array of subgroups to the community
     * @param {string} parentGroupId The ID of a community parent group
     * @param {string|Array<string>} subGroupIds The single group ID or an array of group IDs to link to the created community
     * @param {boolean} [removeOrphanMembers = false] An optional parameter. If true, the method will remove specified subgroups along with their members who are not part of any other subgroups within the community. False by default
     * @returns {Promise<UnlinkSubGroupsResult>} Returns an object that handles the result for the unlinking subgroups action
     */
    async unlinkSubgroups(parentGroupId, subGroupIds, removeOrphanMembers) {
        return await this.client.pupPage.evaluate(
            async (parentGroupId, subGroupIds, removeOrphanMembers) => {
                return await window.WWebJS.linkUnlinkSubgroups(
                    'UnlinkSubgroups',
                    parentGroupId,
                    subGroupIds,
                    removeOrphanMembers
                );
            },
            parentGroupId,
            subGroupIds,
            removeOrphanMembers
        );
    }

    /**
     * An object that handles the result for {@link removeParticipant} method
     * @typedef {Object} RemoveParticipantsResult
     * @property {number} code The code of the result
     * @property {string} message The result message
     */

    /**
     * An object that handles options for removing participants
     * @typedef {Object} RemoveParticipantsOptions
     * @property {Array<number>|number} [sleep = [250, 500]] The number of milliseconds to wait before removing the next participant. If it is an array, a random sleep time between the sleep[0] and sleep[1] values will be added (the difference must be >=100 ms, otherwise, a random sleep time between sleep[1] and sleep[1] + 100 will be added). If sleep is a number, a sleep time equal to its value will be added. By default, sleep is an array with a value of [250, 500]
     */

    /**
     * Removes participants from the community
     * @note Provided participants will be also remove from all community subgroups
     * @param {string|Array<string>} participantIds A single participant ID or an array of participant IDs to remove from the community
     * @param {RemoveParticipantsOptions} options Options to remove participants
     * @returns {Promise<Object.<string, RemoveParticipantsResult>|string} Returns an object with the resulting data or an error message as a string
     */
    async removeParticipants(participantIds, options = {}) {
        return await this.client.pupPage.evaluate(
            async (communityId, participantIds, options) => {
                const { sleep = [250, 500] } = options;
                const communityWid = window.Store.WidFactory.createWid(communityId);
                const community = await window.Store.Chat.find(communityId);
                const participantData = {};

                !Array.isArray(participantIds) && (participantIds = [participantIds]);
                const participantWids = participantIds.map((p) => window.Store.WidFactory.createWid(p));

                const errorCodes = {
                    default: 'An unknown error occupied while removing a participant',
                    iAmNotAdmin: 'RemoveParticipantsError: You have no admin rights to remove participants from the community',
                    200: 'The participant was removed successfully from the community and its subgroups',
                    404: 'The phone number is not registered on WhatsApp',
                    405: 'The participant is not allowed to be removed from the community',
                    406: 'The participant can\'t be removed from the community because they created this community',
                    409: 'The participant is not a community member',
                    500: 'A server error occupied while removing the participant from community subgroups'
                };

                if (!community.iAmAdmin()) {
                    return errorCodes.iAmNotAdmin;
                }

                await window.Store.CommunityUtils.queryAndUpdateCommunityParticipants(communityWid);
                const communityParticipants = community.groupMetadata?.participants._models;

                const _getSleepTime = (sleep) => {
                    if (!Array.isArray(sleep) || (sleep.length === 2 && sleep[0] === sleep[1])) {
                        return sleep;
                    }
                    if (sleep.length === 1) {
                        return sleep[0];
                    }
                    sleep[1] - sleep[0] < 100 && (sleep[0] = sleep[1]) && (sleep[1] += 100);
                    return Math.floor(Math.random() * (sleep[1] - sleep[0] + 1)) + sleep[0];
                };

                for (const pWid of participantWids) {
                    const pId = pWid._serialized;
                    let rpcResult;

                    if (!(await window.Store.QueryExist(pWid))?.wid) {
                        participantData[pId] = {
                            code: 404,
                            message: errorCodes[404]
                        };
                        continue;
                    }

                    if (communityParticipants.every((p) => p.id._serialized !== pId)) {
                        participantData[pId] = {
                            code: 409,
                            message: errorCodes[409]
                        };
                        continue;
                    }

                    try {
                        rpcResult = await window.Store.GroupParticipants.sendRemoveParticipantsRPC({
                            participantArgs: [
                                {
                                    participantJid: window.Store.WidToJid.widToUserJid(pWid)
                                }
                            ],
                            iqTo: window.Store.WidToJid.widToGroupJid(communityWid),
                            hasRemoveLinkedGroupsTrue: true
                        });
                    } catch (err) {
                        participantData[pId] = {
                            code: 400,
                            message: errorCodes.default
                        };
                        continue;
                    } finally {
                        sleep &&
                            participantIds.length > 1 &&
                            participantIds.indexOf(pWid) !== participantIds.length - 1 &&
                            (await new Promise((resolve) => setTimeout(resolve, _getSleepTime(sleep))));
                    }

                    if (rpcResult.name === 'RemoveParticipantsResponseSuccess') {
                        const errorCode =
                            +rpcResult.value.removeParticipant[0]
                                .participantNotInGroupOrParticipantNotAllowedOrParticipantNotAcceptableOrRemoveParticipantsLinkedGroupsServerErrorMixinGroup
                                ?.value.error || 200;

                        participantData[pId] = {
                            code: errorCode,
                            message: errorCodes[errorCode] || errorCodes.default
                        };
                    } else if (rpcResult.name === 'RemoveParticipantsResponseClientError') {
                        const { code: code } = rpcResult.value.errorRemoveParticipantsClientErrors.value;
                        participantData[pId] = {
                            code: +code,
                            message: errorCodes[code] || errorCodes.default
                        };
                    } else if (rpcResult.name === 'RemoveParticipantsResponseServerError') {
                        const { code: code } = rpcResult.value.errorServerErrors.value;
                        participantData[pId] = {
                            code: +code,
                            message: errorCodes[code] || errorCodes.default
                        };
                    }
                }
                return participantData;
            },
            this.id._serialized,
            participantIds,
            options
        );
    }

    /**
     * Allows or disallows for non admin community members to add groups to the community
     * @see https://faq.whatsapp.com/205306122327447
     * @param {boolean} [value=true] True to allow all community members to add groups to the community, false to disallow
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async setNonAdminSubGroupCreation(value = true) {
        return await this._setGroupProperty('allow_non_admin_sub_group_creation', value);
    }

    /**
     * Deactivates the community
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async deactivate() {
        return await this.client.deactivateCommunity(this.id._serialized);
    }
}

module.exports = Community;
