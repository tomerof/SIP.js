"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var api_1 = require("../../api");
var session_description_handler_1 = require("./session-description-handler");
var transport_1 = require("./transport");
/**
 * A Simple SIP User class.
 * @remarks
 * While this class is completely functional for simple use cases, it is not intended
 * to provide an interface which is suitable for most (must less all) applications.
 * While this class has many limitations (for example, it only handles a single concurrent session),
 * it is, however, intended to serve as a simple example of using the SIP.js API.
 */
var SimpleUser = /** @class */ (function () {
    /**
     * Constructs a new instance of the `SimpleUser` class.
     * @param webSocketServerURL - SIP WebSocket Server URL.
     * @param options - Options bucket. See {@link SimpleUserOptions} for details.
     */
    function SimpleUser(webSocketServerURL, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        this.registerer = undefined;
        this.session = undefined;
        // Delegate
        this.delegate = options.delegate;
        // Copy options
        this.options = tslib_1.__assign({}, options);
        // UserAgentOptions
        var userAgentOptions = tslib_1.__assign({}, options.userAgentOptions);
        // Transport
        if (!userAgentOptions.transportConstructor) {
            userAgentOptions.transportConstructor = transport_1.Transport;
        }
        // TransportOptions
        if (!userAgentOptions.transportOptions) {
            userAgentOptions.transportOptions = {
                wsServers: webSocketServerURL
            };
        }
        // URI
        if (!userAgentOptions.uri) {
            // If an AOR was provided, convert it to a URI
            if (options.aor) {
                var uri = api_1.UserAgent.makeURI(options.aor);
                if (!uri) {
                    throw new Error("Failed to create valid URI from " + options.aor);
                }
                userAgentOptions.uri = uri;
            }
        }
        // UserAgent
        this.userAgent = new api_1.UserAgent(userAgentOptions);
        // UserAgent's delegate
        this.userAgent.delegate = {
            // Handle incoming invitations
            onInvite: function (invitation) {
                _this.logger.log("[" + _this.id + "] received INVITE");
                // Guard against a pre-existing session. This implementation only supports one session at a time.
                // However an incoming INVITE request may be received at any time and/or while in the process
                // of sending an outgoing INVITE request. So we reject any incoming INVITE in those cases.
                if (_this.session) {
                    _this.logger.warn("[" + _this.id + "] session already in progress, rejecting INVITE...");
                    invitation.reject()
                        .then(function () {
                        _this.logger.log("[" + _this.id + "] rejected INVITE");
                    })
                        .catch(function (error) {
                        _this.logger.error("[" + _this.id + "] failed to reject INVITE");
                        _this.logger.error(error.toString());
                    });
                    return;
                }
                // Use our configured constraints as options for any Inviter created as result of a REFER
                var referralInviterOptions = {
                    sessionDescriptionHandlerOptions: { constraints: _this.constraints }
                };
                // Initialize our session
                _this.initSession(invitation, referralInviterOptions);
                // Delegate
                if (_this.delegate && _this.delegate.onCallReceived) {
                    _this.delegate.onCallReceived();
                }
                else {
                    _this.logger.warn("[" + _this.id + "] no handler available, rejecting INVITE...");
                    invitation.reject()
                        .then(function () {
                        _this.logger.log("[" + _this.id + "] rejected INVITE");
                    })
                        .catch(function (error) {
                        _this.logger.error("[" + _this.id + "] failed to reject INVITE");
                        _this.logger.error(error.toString());
                    });
                }
            },
            onMessage: function (message) {
                message.accept()
                    .then(function () {
                    if (_this.delegate && _this.delegate.onMessageReceived) {
                        _this.delegate.onMessageReceived(message.request.body);
                    }
                });
            }
        };
        // Use the SIP.js logger
        this.logger = this.userAgent.getLogger("sip.SimpleUser");
    }
    Object.defineProperty(SimpleUser.prototype, "id", {
        /** Instance identifier. */
        get: function () {
            return (this.options.userAgentOptions && this.options.userAgentOptions.displayName) || "Anonymous";
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SimpleUser.prototype, "localAudioTrack", {
        /** The local audio track, if available. */
        get: function () {
            return this.getSenderTrack("audio");
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SimpleUser.prototype, "localVideoTrack", {
        /** The local video track, if available. */
        get: function () {
            return this.getSenderTrack("video");
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SimpleUser.prototype, "remoteAudioTrack", {
        /** The remote audio track, if available. */
        get: function () {
            return this.getReceiverTrack("audio");
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SimpleUser.prototype, "remoteVideoTrack", {
        /** The remote video track, if available. */
        get: function () {
            return this.getReceiverTrack("video");
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Connect.
     * Start the UserAgent's WebSocket Transport.
     */
    SimpleUser.prototype.connect = function () {
        this.logger.log("[" + this.id + "] starting UserAgent...");
        return this.userAgent.start();
    };
    /**
     * Disconnect.
     * Stop the UserAgent's WebSocket Transport.
     */
    SimpleUser.prototype.disconnect = function () {
        this.logger.log("[" + this.id + "] stopping UserAgent...");
        return this.userAgent.stop();
    };
    /**
     * Start receiving incoming calls.
     * Send a REGISTER request for the UserAgent's AOR.
     */
    SimpleUser.prototype.register = function (registererOptions, registererRegisterOptions) {
        var _this = this;
        this.logger.log("[" + this.id + "] registering UserAgent...");
        if (!this.registerer) {
            this.registerer = new api_1.Registerer(this.userAgent, registererOptions);
            this.registerer.stateChange.on(function (state) {
                switch (state) {
                    case api_1.RegistererState.Initial:
                        break;
                    case api_1.RegistererState.Registered:
                        if (_this.delegate && _this.delegate.onRegistered) {
                            _this.delegate.onRegistered();
                        }
                        break;
                    case api_1.RegistererState.Unregistered:
                        if (_this.delegate && _this.delegate.onUnregistered) {
                            _this.delegate.onUnregistered();
                        }
                        break;
                    case api_1.RegistererState.Terminated:
                        _this.registerer = undefined;
                        break;
                    default:
                        throw new Error("Unknown registerer state.");
                }
            });
        }
        return this.registerer.register(registererRegisterOptions)
            .then(function () { return; });
    };
    /**
     * Stop receiving incoming calls.
     * Send an un-REGISTER request for the UserAgent's AOR.
     */
    SimpleUser.prototype.unregister = function (registererUnregisterOptions) {
        this.logger.log("[" + this.id + "] unregistering UserAgent...");
        if (!this.registerer) {
            return Promise.resolve();
        }
        return this.registerer.unregister(registererUnregisterOptions)
            .then(function () { return; });
    };
    /**
     * Make an outoing call.
     * Send an INVITE request to create a new Session.
     * @param destination - The target destination to call. A SIP address to send the INVITE to.
     */
    SimpleUser.prototype.call = function (destination, inviterOptions, inviterInviteOptions) {
        this.logger.log("[" + this.id + "] beginning Session...");
        if (this.session) {
            return Promise.reject(new Error("Session already exists."));
        }
        var target = api_1.UserAgent.makeURI(destination);
        if (!target) {
            return Promise.reject(new Error("Failed to create a valid URI from \"" + destination + "\""));
        }
        // Use our configured constraints as InviterOptions if none provided
        if (!inviterOptions) {
            inviterOptions = {};
        }
        if (!inviterOptions.sessionDescriptionHandlerOptions) {
            inviterOptions.sessionDescriptionHandlerOptions = {};
        }
        if (!inviterOptions.sessionDescriptionHandlerOptions.constraints) {
            inviterOptions.sessionDescriptionHandlerOptions.constraints = this.constraints;
        }
        // Create a new Inviter for the outgoing Session
        var inviter = new api_1.Inviter(this.userAgent, target, inviterOptions);
        // Send INVITE
        return this.sendInvite(inviter, inviterOptions, inviterInviteOptions)
            .then(function () { return; });
    };
    /**
     * Hangup a call.
     * Send a BYE request to end the current Session.
     */
    SimpleUser.prototype.hangup = function () {
        var _this = this;
        this.logger.log("[" + this.id + "] ending Session...");
        if (!this.session) {
            return Promise.reject(new Error("Session does not exist."));
        }
        // Attempt to CANCEL outgoing sessions that are not yet established
        if (this.session instanceof api_1.Inviter) {
            if (this.session.state === api_1.SessionState.Initial || this.session.state === api_1.SessionState.Establishing) {
                return this.session.cancel()
                    .then(function () {
                    _this.logger.log("[" + _this.id + "] sent CANCEL");
                });
            }
        }
        // Send BYE
        return new api_1.Byer(this.session).bye()
            .then(function () {
            _this.logger.log("[" + _this.id + "] sent BYE");
        });
    };
    /**
     * Answer an incoming call.
     * Accept an incoming INVITE request creating a new Session.
     */
    SimpleUser.prototype.answer = function (invitationAcceptOptions) {
        this.logger.log("[" + this.id + "] accepting Invitation...");
        if (!this.session) {
            return Promise.reject(new Error("Session does not exist."));
        }
        if (!(this.session instanceof api_1.Invitation)) {
            return Promise.reject(new Error("Session not instance of Invitation."));
        }
        // Use our configured constraints as InvitationAcceptOptions if none provided
        if (!invitationAcceptOptions) {
            invitationAcceptOptions = {};
        }
        if (!invitationAcceptOptions.sessionDescriptionHandlerOptions) {
            invitationAcceptOptions.sessionDescriptionHandlerOptions = {};
        }
        if (!invitationAcceptOptions.sessionDescriptionHandlerOptions.constraints) {
            invitationAcceptOptions.sessionDescriptionHandlerOptions.constraints = this.constraints;
        }
        return this.session.accept(invitationAcceptOptions);
    };
    /**
     * Decline an incoming call.
     * Reject an incoming INVITE request.
     */
    SimpleUser.prototype.decline = function () {
        this.logger.log("[" + this.id + "] rejecting Invitation...");
        if (!this.session) {
            return Promise.reject(new Error("Session does not exist."));
        }
        if (!(this.session instanceof api_1.Invitation)) {
            return Promise.reject(new Error("Session not instance of Invitation."));
        }
        return this.session.reject();
    };
    /**
     * Hold call.
     * Send a re-INVITE with new offer indicating "hold".
     * See: https://tools.ietf.org/html/rfc6337
     */
    SimpleUser.prototype.hold = function () {
        this.logger.log("[" + this.id + "] holding session...");
        if (!this.session) {
            return Promise.reject(new Error("Session does not exist."));
        }
        if (this.session.state !== api_1.SessionState.Established) {
            return Promise.reject(new Error("Session is not established."));
        }
        var sessionDescriptionHandler = this.session.sessionDescriptionHandler;
        if (!(sessionDescriptionHandler instanceof session_description_handler_1.SessionDescriptionHandler)) {
            throw new Error("Session's session description handler not instance of SessionDescriptionHandler.");
        }
        var options = {
            sessionDescriptionHandlerModifiers: [sessionDescriptionHandler.holdModifier]
        };
        // Mute
        this.mute();
        // Send re-INVITE
        return this.session.invite(options)
            .then(function () { return; });
    };
    /**
     * Unhold call.
     * Send a re-INVITE with new offer indicating "unhold".
     * See: https://tools.ietf.org/html/rfc6337
     */
    SimpleUser.prototype.unhold = function () {
        this.logger.log("[" + this.id + "] unholding session...");
        if (!this.session) {
            return Promise.reject(new Error("Session does not exist."));
        }
        if (this.session.state !== api_1.SessionState.Established) {
            return Promise.reject(new Error("Session is not established."));
        }
        var sessionDescriptionHandler = this.session.sessionDescriptionHandler;
        if (!(sessionDescriptionHandler instanceof session_description_handler_1.SessionDescriptionHandler)) {
            throw new Error("Session's session description handler not instance of SessionDescriptionHandler.");
        }
        var options = {};
        // Unmute
        this.unmute();
        // Send re-INVITE
        return this.session.invite(options)
            .then(function () { return; });
    };
    /**
     * Mute call.
     * Disable sender's media tracks.
     */
    SimpleUser.prototype.mute = function () {
        this.logger.log("[" + this.id + "] disabling media tracks...");
        if (!this.session) {
            this.logger.warn("[" + this.id + "] an session is required to disable media tracks");
            return;
        }
        if (this.session.state !== api_1.SessionState.Established) {
            this.logger.warn("[" + this.id + "] an established session is required to disable media tracks");
            return;
        }
        this.enableSenderTracks(false);
    };
    /**
     * Unmute call.
     * Enable sender's media tracks.
     */
    SimpleUser.prototype.unmute = function () {
        this.logger.log("[" + this.id + "] enabling media tracks...");
        if (!this.session) {
            this.logger.warn("[" + this.id + "] an session is required to enable media tracks");
            return;
        }
        if (this.session.state !== api_1.SessionState.Established) {
            this.logger.warn("[" + this.id + "] an established session is required to enable media tracks");
            return;
        }
        this.enableSenderTracks(true);
    };
    /**
     * Mute state.
     * True if sender's media track is disabled.
     */
    SimpleUser.prototype.isMuted = function () {
        var track = this.localAudioTrack || this.localVideoTrack;
        if (!track) {
            return false;
        }
        return !track.enabled;
    };
    /**
     * Send DTMF.
     * Send an INFO request with content type application/dtmf-relay.
     * @param tone - Tone to send.
     */
    SimpleUser.prototype.sendDTMF = function (tone) {
        this.logger.log("[" + this.id + "] sending DTMF...");
        // Validate tone
        if (!tone.match(/^[0-9A-D#*,]$/)) {
            return Promise.reject(new Error("Invalid DTMF tone."));
        }
        if (!this.session) {
            return Promise.reject(new Error("Session does not exist."));
        }
        this.logger.log("Sending DTMF tone: " + tone);
        var dtmf = tone;
        var duration = 2000;
        var body = {
            contentDisposition: "render",
            contentType: "application/dtmf-relay",
            content: "Signal=" + dtmf + "\r\nDuration=" + duration
        };
        var requestOptions = { body: body };
        return new api_1.Infoer(this.session).info({ requestOptions: requestOptions })
            .then(function () { return; });
    };
    /**
     * Send a message.
     * Send a MESSAGE request.
     * @param destination - The target destination for the message. A SIP address to send the MESSAGE to.
     */
    SimpleUser.prototype.message = function (destination, message) {
        this.logger.log("[" + this.id + "] sending message...");
        var target = api_1.UserAgent.makeURI(destination);
        if (!target) {
            return Promise.reject(new Error("Failed to create a valid URI from \"" + destination + "\""));
        }
        return new api_1.Messager(this.userAgent, target, message).message();
    };
    Object.defineProperty(SimpleUser.prototype, "constraints", {
        /** Media constraints. */
        get: function () {
            var constraints = { audio: true, video: false }; // default to audio only calls
            if (this.options.media && this.options.media.constraints) {
                constraints = tslib_1.__assign({}, this.options.media.constraints);
                if (!constraints.audio && !constraints.video) {
                    throw new Error("Invalid media constraints - audio and/or video must be true.");
                }
            }
            return constraints;
        },
        enumerable: true,
        configurable: true
    });
    /** Helper function to enable/disable media tracks. */
    SimpleUser.prototype.enableSenderTracks = function (enable) {
        if (!this.session) {
            throw new Error("Session does not exist.");
        }
        var sessionDescriptionHandler = this.session.sessionDescriptionHandler;
        if (!(sessionDescriptionHandler instanceof session_description_handler_1.SessionDescriptionHandler)) {
            throw new Error("Session's session description handler not instance of SessionDescriptionHandler.");
        }
        var peerConnection = sessionDescriptionHandler.peerConnection;
        peerConnection.getSenders().forEach(function (sender) {
            if (sender.track) {
                sender.track.enabled = enable;
            }
        });
    };
    /** The receiver media track, if available. */
    SimpleUser.prototype.getReceiverTrack = function (kind) {
        if (!this.session) {
            this.logger.warn("[" + this.id + "] getReceiverTrack - session undefined");
            return undefined;
        }
        var sessionDescriptionHandler = this.session.sessionDescriptionHandler;
        if (!sessionDescriptionHandler) {
            this.logger.warn("[" + this.id + "] getReceiverTrack - session description handler undefined");
            return undefined;
        }
        if (!(sessionDescriptionHandler instanceof session_description_handler_1.SessionDescriptionHandler)) {
            throw new Error("Session's session description handler not instance of SessionDescriptionHandler.");
        }
        var peerConnection = sessionDescriptionHandler.peerConnection;
        var rtpReceiver = peerConnection.getReceivers().find(function (receiver) {
            return receiver.track.kind === kind ? true : false;
        });
        return rtpReceiver ? rtpReceiver.track : undefined;
    };
    /** The sender media track, if available. */
    SimpleUser.prototype.getSenderTrack = function (kind) {
        if (!this.session) {
            this.logger.warn("[" + this.id + "] getSenderTrack - session undefined");
            return undefined;
        }
        var sessionDescriptionHandler = this.session.sessionDescriptionHandler;
        if (!sessionDescriptionHandler) {
            this.logger.warn("[" + this.id + "] getSenderTrack - session description handler undefined");
            return undefined;
        }
        if (!(sessionDescriptionHandler instanceof session_description_handler_1.SessionDescriptionHandler)) {
            throw new Error("Session's session description handler not instance of SessionDescriptionHandler.");
        }
        var peerConnection = sessionDescriptionHandler.peerConnection;
        var rtpSender = peerConnection.getSenders().find(function (sender) {
            return sender.track && sender.track.kind === kind ? true : false;
        });
        return rtpSender && rtpSender.track ? rtpSender.track : undefined;
    };
    /**
     * Setup session delegate and state change handler.
     * @param session - Session to setup
     * @param referralInviterOptions - Options for any Inviter created as result of a REFER.
     */
    SimpleUser.prototype.initSession = function (session, referralInviterOptions) {
        var _this = this;
        // Set session
        this.session = session;
        // Call session created callback
        if (this.delegate && this.delegate.onCallCreated) {
            this.delegate.onCallCreated();
        }
        // Setup session state change handler
        this.session.stateChange.on(function (state) {
            if (_this.session !== session) {
                return; // if our session has changed, just return
            }
            _this.logger.log("[" + _this.id + "] session state changed to " + state);
            switch (state) {
                case api_1.SessionState.Initial:
                    break;
                case api_1.SessionState.Establishing:
                    break;
                case api_1.SessionState.Established:
                    _this.setupLocalMedia();
                    _this.setupRemoteMedia();
                    if (_this.delegate && _this.delegate.onCallAnswered) {
                        _this.delegate.onCallAnswered();
                    }
                    break;
                case api_1.SessionState.Terminating:
                    break;
                case api_1.SessionState.Terminated:
                    _this.session = undefined;
                    _this.cleanupMedia();
                    if (_this.delegate && _this.delegate.onCallHangup) {
                        _this.delegate.onCallHangup();
                    }
                    break;
                default:
                    throw new Error("Unknown session state.");
            }
        });
        // Setup delegate
        this.session.delegate = {
            onRefer: function (referral) {
                referral
                    .accept()
                    .then(function () { return _this.sendInvite(referral.makeInviter(referralInviterOptions), referralInviterOptions); })
                    .catch(function (error) {
                    _this.logger.error(error.message);
                });
            }
        };
    };
    /** Helper function to init send then send invite. */
    SimpleUser.prototype.sendInvite = function (inviter, inviterOptions, inviterInviteOptions) {
        var _this = this;
        // Initialize our session
        this.initSession(inviter, inviterOptions);
        // Send the INVITE
        return inviter.invite(inviterInviteOptions)
            .then(function (request) {
            _this.logger.log("[" + _this.id + "] sent INVITE");
        });
    };
    /** Helper function to attach local media to html elements. */
    SimpleUser.prototype.setupLocalMedia = function () {
        if (!this.session) {
            throw new Error("Session does not exist.");
        }
        if (this.options.media && this.options.media.local && this.options.media.local.video) {
            var localVideoTrack = this.localVideoTrack;
            if (localVideoTrack) {
                var localStream = new MediaStream([localVideoTrack]);
                this.options.media.local.video.srcObject = localStream;
                this.options.media.local.video.volume = 0;
                this.options.media.local.video.play();
            }
        }
    };
    /** Helper function to attach remote media to html elements. */
    SimpleUser.prototype.setupRemoteMedia = function () {
        var _this = this;
        if (!this.session) {
            throw new Error("Session does not exist.");
        }
        if (this.options.media && this.options.media.remote) {
            var remoteAudioTrack = this.remoteAudioTrack;
            var remoteVideoTrack = this.remoteVideoTrack;
            var remoteStream = new MediaStream();
            // If there is a video element, both audio and video will be attached that element.
            if (this.options.media.remote.video) {
                if (remoteAudioTrack) {
                    remoteStream.addTrack(remoteAudioTrack);
                }
                if (remoteVideoTrack) {
                    remoteStream.addTrack(remoteVideoTrack);
                }
                this.options.media.remote.video.srcObject = remoteStream;
                this.options.media.remote.video.play()
                    .catch(function (error) {
                    _this.logger.error("[" + _this.id + "] error playing video");
                    _this.logger.error(error.message);
                });
            }
            else if (this.options.media.remote.audio) {
                if (remoteAudioTrack) {
                    remoteStream.addTrack(remoteAudioTrack);
                    this.options.media.remote.audio.srcObject = remoteStream;
                    this.options.media.remote.audio.play()
                        .catch(function (error) {
                        _this.logger.error("[" + _this.id + "] error playing audio");
                        _this.logger.error(error.message);
                    });
                }
            }
        }
    };
    /** Helper function to remove media from html elements. */
    SimpleUser.prototype.cleanupMedia = function () {
        if (this.options.media) {
            if (this.options.media.local) {
                if (this.options.media.local.video) {
                    this.options.media.local.video.srcObject = null;
                    this.options.media.local.video.pause();
                }
            }
            if (this.options.media.remote) {
                if (this.options.media.remote.audio) {
                    this.options.media.remote.audio.srcObject = null;
                    this.options.media.remote.audio.pause();
                }
                if (this.options.media.remote.video) {
                    this.options.media.remote.video.srcObject = null;
                    this.options.media.remote.video.pause();
                }
            }
        }
    };
    return SimpleUser;
}());
exports.SimpleUser = SimpleUser;