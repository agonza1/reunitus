import React from 'react';

import '../App.css';
import offline from "../images/offline.jpg";
import Janus from './Janus';
import $ from 'jquery';
import {Container, Row, Col} from 'react-bootstrap'

const server = process.env.REACT_APP_JANUS_URL || "http://localhost:8088/janus";
const opaqueId = "videoroom-"+Janus.randomString(12);

let janusRoom = null;
let vroomHandle = null;
let mypvtid = null;
let myusername = null;
let remoteFeed = null;
let feeds = {};
let feedStreams = {};
let subStreams = {}; 
let slots = {}; 
let mids = {}; 
let subscriptions = {};
let myid = null;
let mystream = null;
let localTracks = {};
let localVideos = 0;
let remoteTracks = {};
let bitrateTimer = [], simulcastStarted = {}, svcStarted = {};

class Room extends React.Component {
    state = {
        myroom: 1234,
        subscriber_mode: false,
        use_msid: false,
    };

    constructor(props) {
        super(props);
    }

    componentDidMount() {
        const { myroom, subscriber_mode, use_msid } = this.state;
        this.startJanusServerRoom(myroom, subscriber_mode, use_msid);
    }

    startJanusServerRoom(myroom, subscriber_mode, use_msid){
        function publishOwnFeed(useAudio) {
            // Publish our stream
            vroomHandle.createOffer(
                {
                    media: { audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true },	// Publishers are sendonly
                    success: function(jsep) {
                        Janus.debug("Got publisher SDP!");
                        Janus.debug(jsep);
                        const publish = { "request": "configure", "audio": useAudio, "video": true };
                        vroomHandle.send({"message": publish, "jsep": jsep});
                    },
                    error: function(error) {
                        Janus.error("WebRTC error:", error);
                        if (useAudio) {
                            publishOwnFeed(false);
                        }
                    }
                });
        }

        let creatingSubscription = false;
        function subscribeTo(sources) {
            // Check if we're still creating the subscription handle
            if(creatingSubscription) {
                // Still working on the handle, send this request later when it's ready
                setTimeout(function() {
                    subscribeTo(sources);
                }, 500);
                return;
            }
            // If we already have a working subscription handle, just update that one
            if(remoteFeed) {
                // Prepare the streams to subscribe to, as an array: we have the list of
                // streams the feeds are publishing, so we can choose what to pick or skip
                let added = null, removed = null;
                for(let s in sources) {
                    let streams = sources[s];
                    for(let i in streams) {
                        let stream = streams[i];
                        // If the publisher is VP8/VP9 and this is an older Safari, let's avoid video
                        if(stream.type === "video" && Janus.webRTCAdapter.browserDetails.browser === "safari" &&
                                ((stream.codec === "vp9" && !Janus.safariVp9) || (stream.codec === "vp8" && !Janus.safariVp8))) {
                            console.log("Publisher is using " + stream.codec.toUpperCase +
                                ", but Safari doesn't support it: disabling video stream #" + stream.mindex);
                            continue;
                        }
                        if(stream.disabled) {
                            Janus.log("Disabled stream:", stream);
                            // Unsubscribe
                            if(!removed)
                                removed = [];
                            removed.push({
                                feed: stream.id,	// This is mandatory
                                mid: stream.mid		// This is optional (all streams, if missing)
                            });
                            delete subscriptions[stream.id][stream.mid];
                            continue;
                        }
                        if(subscriptions[stream.id] && subscriptions[stream.id][stream.mid]) {
                            Janus.log("Already subscribed to stream, skipping:", stream);
                            continue;
                        }
                        // Find an empty slot in the UI for each new source
                        if(!feedStreams[stream.id].slot) {
                            let slot;
                            for(let i=1;i<6;i++) {
                                if(!feeds[i]) {
                                    slot = i;
                                    feeds[slot] = stream.id;
                                    feedStreams[stream.id].slot = slot;
                                    feedStreams[stream.id].remoteVideos = 0;
                                    $('#remote' + slot).removeClass('hide').html(escapeXmlTags(stream.display)).removeClass('hide');
                                    break;
                                }
                            }
                        }
                        // Subscribe
                        if(!added)
                            added = [];
                        added.push({
                            feed: stream.id,	// This is mandatory
                            mid: stream.mid		// This is optional (all streams, if missing)
                        });
                        if(!subscriptions[stream.id])
                            subscriptions[stream.id] = {};
                        subscriptions[stream.id][stream.mid] = true;
                    }
                }
                if((!added || added.length === 0) && (!removed || removed.length === 0)) {
                    // Nothing to do
                    return;
                }
                let update = { request: 'update' };
                if(added)
                    update.subscribe = added;
                if(removed)
                    update.unsubscribe = removed;
                remoteFeed.send({ message: update });
                // Nothing else we need to do
                return;
            }
            // If we got here, we're creating a new handle for the subscriptions (we only need one)
            creatingSubscription = true;
            janusRoom.attach(
                {
                    plugin: "janus.plugin.videoroom",
                    opaqueId: opaqueId,
                    success: function(pluginHandle) {
                        remoteFeed = pluginHandle;
                        remoteTracks = {}
                        console.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                        Janus.log("  -- This is a multistream subscriber");
                        // Prepare the streams to subscribe to, as an array: we have the list of
                        // streams the feed is publishing, so we can choose what to pick or skip
                        let subscription = [];
                        for(let s in sources) {
                            let streams = sources[s];
                            for(let i in streams) {
                                let stream = streams[i];
                                // If the publisher is VP8/VP9 and this is an older Safari, let's avoid video
                                if(stream.type === "video" && Janus.webRTCAdapter.browserDetails.browser === "safari" &&
                                        ((stream.codec === "vp9" && !Janus.safariVp9) || (stream.codec === "vp8" && !Janus.safariVp8))) {
                                    console.log("Publisher is using " + stream.codec.toUpperCase +
                                        ", but Safari doesn't support it: disabling video stream #" + stream.mindex);
                                    continue;
                                }
                                if(stream.disabled) {
                                    Janus.log("Disabled stream:", stream);
                                    // TODO Skipping for now, we should unsubscribe
                                    continue;
                                }
                                Janus.log("Subscribed to " + stream.id + "/" + stream.mid + "?", subscriptions);
                                if(subscriptions[stream.id] && subscriptions[stream.id][stream.mid]) {
                                    Janus.log("Already subscribed to stream, skipping:", stream);
                                    continue;
                                }
                                // Find an empty slot in the UI for each new source
                                if(!feedStreams[stream.id].slot) {
                                    let slot;
                                    for(let i=1;i<6;i++) {
                                        if(!feeds[i]) {
                                            slot = i;
                                            feeds[slot] = stream.id;
                                            feedStreams[stream.id].slot = slot;
                                            feedStreams[stream.id].remoteVideos = 0;
                                            $('#remote' + slot).removeClass('hide').html(escapeXmlTags(stream.display)).removeClass('hide');
                                            break;
                                        }
                                    }
                                }
                                subscription.push({
                                    feed: stream.id,	// This is mandatory
                                    mid: stream.mid		// This is optional (all streams, if missing)
                                });
                                if(!subscriptions[stream.id])
                                    subscriptions[stream.id] = {};
                                subscriptions[stream.id][stream.mid] = true;
                            }
                        }
                        // We wait for the plugin to send us an offer
                        let subscribe = {
                            request: "join",
                            room: myroom,
                            ptype: "subscriber",
                            streams: subscription,
                            use_msid: use_msid,
                            private_id: mypvtid
                        };
                        remoteFeed.send({ message: subscribe });
                    },
                    error: function(error) {
                        Janus.error("  -- Error attaching plugin...", error);
                    },
                    onmessage: function(msg, jsep) {
                        Janus.debug(" ::: Got a message (subscriber) :::", msg);
                        let event = msg["videoroom"];
                        Janus.debug("Event: " + event);
                        if(msg["error"]) {
                            alert(msg["error"]);
                        } else if(event) {
                            if(event === "attached") {
                                // Now we have a working subscription, next requests will update this one
                                creatingSubscription = false;
                                Janus.log("Successfully attached to feed in room " + msg["room"]);
                            } else if(event === "event") {
                                // Check if we got an event on a simulcast-related event from this publisher
                                let mid = msg["mid"];
                                let substream = msg["substream"];
                                let temporal = msg["temporal"];
                                // TODO (handle simulcast)
                            }
                        }
                        if(msg["streams"]) {
                            // Update map of subscriptions by mid
                            for(let i in msg["streams"]) {
                                let mid = msg["streams"][i]["mid"];
                                subStreams[mid] = msg["streams"][i];
                                let feed = feedStreams[msg["streams"][i]["feed_id"]];
                                if(feed && feed.slot) {
                                    slots[mid] = feed.slot;
                                    mids[feed.slot] = mid;
                                }
                            }
                        }
                        if(jsep) {
                            Janus.debug("Handling SDP as well...", jsep);
                            // Answer and attach
                            remoteFeed.createAnswer(
                                {
                                    jsep: jsep,
                                    // Add data:true here if you want to subscribe to datachannels as well
                                    // (obviously only works if the publisher offered them in the first place)
                                    media: { audioSend: false, videoSend: false },	// We want recvonly audio/video
                                    success: function(jsep) {
                                        Janus.debug("Got SDP!", jsep);
                                        let body = { request: "start", room: myroom };
                                        remoteFeed.send({ message: body, jsep: jsep });
                                    },
                                    error: function(error) {
                                        console.error("WebRTC error:", error);
                                    }
                                });
                        }
                    },
                    iceState: function(state) {
                        Janus.log("ICE state of this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") changed to " + state);
                    },
                    webrtcState: function(on) {
                        Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
                    },
                    onremotetrack: function(track, mid, on, metadata) {
                        Janus.debug(
                            "Remote track (mid=" + mid + ") " +
                            (on ? "added" : "removed") +
                            (metadata ? " (" + metadata.reason + ") ": "") + ":", track
                        );
                        // Which publisher are we getting on this mid?
                        let sub = subStreams[mid];
                        let feed = feedStreams[sub.feed_id];
                        Janus.debug(" >> This track is coming from feed " + sub.feed_id + ":", feed);
                        let slot = slots[mid];
                        if(feed && !slot) {
                            slot = feed.slot;
                            slots[mid] = feed.slot;
                            mids[feed.slot] = mid;
                        }
                        Janus.debug(" >> mid " + mid + " is in slot " + slot);
                        if(!on) {
                            // Track removed, get rid of the stream and the rendering
                            if(track.kind === "video" && feed) {
                                feed.remoteVideos--;
                                if(feed.remoteVideos === 0) {
                                    // No video, at least for now: show a placeholder
                                    if($('#videoremote' + slot + ' .no-video-container').length === 0) {
                                        $('#videoremote' + slot).append(
                                            '<div class="no-video-container">' +
                                                '<i class="fa-solid fa-video fa-xl no-video-icon"></i>' +
                                                '<span class="no-video-text">No remote video available</span>' +
                                            '</div>');
                                    }
                                }
                            }
                            delete remoteTracks[mid];
                            delete slots[mid];
                            delete mids[slot];
                            return;
                        }
                        // If we're here, a new track was added
                        if($('#remotevideo' + slot + '-' + mid).length > 0)
                            return;
                        if(track.kind === "audio") {
                            // New audio track: create a stream out of it, and use a hidden <audio> element
                            let stream = new MediaStream([track]);
                            remoteTracks[mid] = stream;
                            Janus.log("Created remote audio stream:", stream);
                            $('#videoremote' + slot).append('<audio class="hide" id="remotevideo' + slot + '-' + mid + '" autoplay playsinline/>');
                            Janus.attachMediaStream($('#remotevideo' + slot + '-' + mid).get(0), stream);
                            if(feed.remoteVideos === 0) {
                                // No video, at least for now: show a placeholder
                                if($('#videoremote' + slot + ' .no-video-container').length === 0) {
                                    $('#videoremote' + slot).append(
                                        '<div class="no-video-container">' +
                                            '<i class="fa-solid fa-video fa-xl no-video-icon"></i>' +
                                            '<span class="no-video-text">No remote video available</span>' +
                                        '</div>');
                                }
                            }
                        } else {
                            // New video track: create a stream out of it
                            feed.remoteVideos++;
                            $('#videoremote' + slot + ' .no-video-container').remove();
                            let stream = new MediaStream([track]);
                            remoteTracks[mid] = stream;
                            Janus.log("Created remote video stream:", stream);
                            $('#videoremote' + slot).children('img').hide();
                            $('#videoremote' + slot).append('<video class="rounded centered" id="remotevideo' + slot + '-' + mid + '" width=100% autoplay playsinline/>');
                            $('#videoremote' + slot).append(
                                '<span class="badge bg-primary hide" id="curres'+slot+'" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;"></span>' +
                                '<span class="badge bg-info hide" id="curbitrate'+slot+'" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;"></span>');
                            Janus.attachMediaStream($('#remotevideo' + slot + '-' + mid).get(0), stream);
                            // Note: we'll need this for additional videos too
                            if(!bitrateTimer[slot]) {
                                $('#curbitrate' + slot).removeClass('hide');
                                bitrateTimer[slot] = setInterval(function() {
                                    if(!$("#videoremote" + slot + ' video').get(0))
                                        return;
                                    // Display updated bitrate, if supported
                                    let bitrate = remoteFeed.getBitrate(mid);
                                    $('#curbitrate' + slot).text(bitrate);
                                    // Check if the resolution changed too
                                    let width = $("#videoremote" + slot + ' video').get(0).videoWidth;
                                    let height = $("#videoremote" + slot + ' video').get(0).videoHeight;
                                    if(width > 0 && height > 0) {
                                        let res = width + 'x' + height;
                                        if(simulcastStarted[slot])
                                            res += ' (simulcast)';
                                        else if(svcStarted[slot])
                                            res += ' (SVC)';
                                        $('#curres' + slot).removeClass('hide').text(res).removeClass('hide');
                                    }
                                }, 1000);
                            }
                        }
                    },
                    oncleanup: function() {
                        Janus.log(" ::: Got a cleanup notification (remote feed) :::");
                        if(remoteFeed.spinner)
                            remoteFeed.spinner.stop();
                        $('#remotevideo'+remoteFeed.rfindex).remove();
                        $('#videoremote'+remoteFeed.rfindex).append('<img src="' + offline + '" id="img1" class="card-media-image" style="width:300px;height:250px"></img>');
                    }
                });
        }

        function unsubscribeFrom(id) {
            // Unsubscribe from this publisher
            let feed = feedStreams[id];
            if(!feed)
                return;
            Janus.debug("Feed " + id + " (" + feed.display + ") has left the room, detaching");
            if(bitrateTimer[feed.slot])
                clearInterval(bitrateTimer[feed.slot]);
            bitrateTimer[feed.slot] = null;
            $('#remote' + feed.slot).empty().addClass('hide');
            $('#videoremote' + feed.slot).empty();
            delete simulcastStarted[feed.slot];
            delete svcStarted[feed.slot];
            $('#simulcast' + feed.slot).remove();
            delete feeds[feed.slot];
            feeds.slot = 0;
            delete feedStreams[id];
            // Send an unsubscribe request
            let unsubscribe = {
                request: "unsubscribe",
                streams: [{ feed: id }]
            };
            if(remoteFeed != null)
                remoteFeed.send({ message: unsubscribe });
            delete subscriptions[id];
        }

        // Initialize the library (all console debuggers enabled)
        Janus.init({debug: "all", callback: function() {
                // Make sure the browser supports WebRTC
                // Create session
                janusRoom = new Janus(
                    {
                        server: server,
                        success: function() {
                            // Attach to VideoRoom plugin
                            janusRoom.attach(
                                {
                                    plugin: "janus.plugin.videoroom",
                                    opaqueId: opaqueId,
                                    success: function (pluginHandle) {
                                        vroomHandle = pluginHandle;
                                        Janus.log("Plugin attached! (" + vroomHandle.getPlugin() + ", id=" + vroomHandle.getId() + ")");
                                        Janus.log("  -- This is a publisher/manager");
                                        // Prepare the username registration
                                        let reg = Janus.randomString(12);
                                        const register = { "request": "join", "room": myroom, "ptype": "publisher", "display": reg };
                                        myusername = reg;
                                        vroomHandle.send({ "message": register });
                                    },
                                    error: function (error) {
                                        Janus.error("  -- Error attaching plugin...", error);
                                    },
                                    consentDialog: function (on) {
                                        Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
                                    },
                                    mediaState: function (medium, on) {
                                        Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                                    },
                                    webrtcState: function (on) {
                                        Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                                    },
                                    onmessage: function (msg, jsep) {
                                        Janus.log(" ::: Got a message (publisher) :::");
                                        let event = msg["videoroom"];
                                        Janus.debug(event);
                                        if(event != undefined && event != null) {
                                            if(event === "joined") {
                                                // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                                myid = msg["id"];
                                                mypvtid = msg["private_id"];
                                                Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                                                if(subscriber_mode) {
                                                    $('#videojoin').addClass('hide');
                                                    $('#videos').removeClass('hide');
                                                } else {
                                                    publishOwnFeed(true);
                                                }
                                                // Any new feed to attach to?
                                                if(msg["publishers"]) {
                                                    let list = msg["publishers"];
                                                    Janus.debug("Got a list of available publishers/feeds:", list);
                                                    let sources = null;
                                                    for(let f in list) {
                                                        if(list[f]["dummy"])
                                                            continue;
                                                        let id = list[f]["id"];
                                                        let display = list[f]["display"];
                                                        let streams = list[f]["streams"];
                                                        for(let i in streams) {
                                                            let stream = streams[i];
                                                            stream["id"] = id;
                                                            stream["display"] = display;
                                                        }
                                                        let slot = feedStreams[id] ? feedStreams[id].slot : null;
                                                        let remoteVideos = feedStreams[id] ? feedStreams[id].remoteVideos : 0;
                                                        feedStreams[id] = {
                                                            id: id,
                                                            display: display,
                                                            streams: streams,
                                                            slot: slot,
                                                            remoteVideos: remoteVideos
                                                        }
                                                        Janus.debug("  >> [" + id + "] " + display + ":", streams);
                                                        if(!sources)
                                                            sources = [];
                                                        sources.push(streams);
                                                    }
                                                    if(sources)
                                                        subscribeTo(sources);
                                                }
                                            } else if(event === "destroyed") {
                                                // The room has been destroyed
                                                Janus.warn("The room has been destroyed!");
                                                if (window.confirm("The room has been destroyed. Reload the page?")) {
                                                    window.location.reload();
                                                }
                                            } else if(event === "event") {
                                                // Any info on our streams or a new feed to attach to?
                                                if(msg["streams"]) {
                                                    let streams = msg["streams"];
                                                    for(let i in streams) {
                                                        let stream = streams[i];
                                                        stream["id"] = myid;
                                                        stream["display"] = myusername;
                                                    }
                                                    feedStreams[myid] = {
                                                        id: myid,
                                                        display: myusername,
                                                        streams: streams
                                                    }
                                                } else if(msg["publishers"]) {
                                                    let list = msg["publishers"];
                                                    Janus.debug("Got a list of available publishers/feeds:", list);
                                                    let sources = null;
                                                    for(let f in list) {
                                                        if(list[f]["dummy"])
                                                            continue;
                                                        let id = list[f]["id"];
                                                        let display = list[f]["display"];
                                                        let streams = list[f]["streams"];
                                                        for(let i in streams) {
                                                            let stream = streams[i];
                                                            stream["id"] = id;
                                                            stream["display"] = display;
                                                        }
                                                        let slot = feedStreams[id] ? feedStreams[id].slot : null;
                                                        let remoteVideos = feedStreams[id] ? feedStreams[id].remoteVideos : 0;
                                                        feedStreams[id] = {
                                                            id: id,
                                                            display: display,
                                                            streams: streams,
                                                            slot: slot,
                                                            remoteVideos: remoteVideos
                                                        }
                                                        Janus.debug("  >> [" + id + "] " + display + ":", streams);
                                                        if(!sources)
                                                            sources = [];
                                                        sources.push(streams);
                                                    }
                                                    if(sources)
                                                        subscribeTo(sources);
                                                } else if(msg["leaving"]) {
                                                    // One of the publishers has gone away?
                                                    let leaving = msg["leaving"];
                                                    Janus.log("Publisher left: " + leaving);
                                                    unsubscribeFrom(leaving);
                                                } else if(msg["unpublished"]) {
                                                    // One of the publishers has unpublished?
                                                    let unpublished = msg["unpublished"];
                                                    Janus.log("Publisher left: " + unpublished);
                                                    if(unpublished === 'ok') {
                                                        // That's us
                                                        vroomHandle.hangup();
                                                        return;
                                                    }
                                                    unsubscribeFrom(unpublished);
                                                } else if(msg["error"]) {
                                                    if(msg["error_code"] === 426) {
                                                        // This is a "no such room" error: give a more meaningful description
                                                        alert(
                                                            "<p>Apparently room <code>" + myroom + "</code> (the one this demo uses as a test room) " +
                                                            "does not exist...</p><p>Do you have an updated <code>janus.plugin.videoroom.cfg</code> " +
                                                            "configuration file? If not, make sure you copy the details of room <code>" + myroom + "</code> " +
                                                            "from that sample in your current configuration file, then restart Janus and try again."
                                                        );
                                                    } else {
                                                        alert(msg["error"]);
                                                    }
                                                }
                                            }
                                        }
                                        if(jsep) {
                                            Janus.debug("Handling SDP as well...", jsep);
                                            vroomHandle.handleRemoteJsep({ jsep: jsep });
                                            // Check if any of the media we wanted to publish has
                                            // been rejected (e.g., wrong or unsupported codec)
                                            let audio = msg["audio_codec"];
                                            if(mystream && mystream.getAudioTracks() && mystream.getAudioTracks().length > 0 && !audio) {
                                                // Audio has been rejected
                                                console.error("Our audio stream has been rejected, viewers won't hear us");
                                            }
                                            let video = msg["video_codec"];
                                            if(mystream && mystream.getVideoTracks() && mystream.getVideoTracks().length > 0 && !video) {
                                                // Video has been rejected
                                                console.error("Our video stream has been rejected, viewers won't see us");
                                                // Hide the webcam video
                                                $('#myvideo').addClass('hide');
                                                $('#videolocal').append(
                                                    '<div class="no-video-container">' +
                                                        '<i class="fa-solid fa-video fa-xl no-video-icon" style="height: 100%;"></i>' +
                                                        '<span class="no-video-text" style="font-size: 16px;">Video rejected, no webcam</span>' +
                                                    '</div>');
                                            }
                                        }
                                    },
                                    onlocaltrack: function(track, on) {
                                        Janus.log(" ::: Got a local track event :::");
                                        Janus.debug("Local track " + (on ? "added" : "removed") + ":", track);
                                        // We use the track ID as name of the element, but it may contain invalid characters
                                        let trackId = track.id.replace(/[{}]/g, "");
                                        const video = document.querySelector('video#localvideo');
                                        if(!on) {
                                            // Track removed, get rid of the stream and the rendering
                                            let stream = localTracks[trackId];
                                            if(stream) {
                                                try {
                                                    let tracks = stream.getTracks();
                                                    for(let i in tracks) {
                                                        let mst = tracks[i];
                                                        if(mst)
                                                            mst.stop();
                                                    }
                                                } catch(e) {}
                                            }
                                            if(track.kind === "video") {
                                                // video.remove();
                                                localVideos--;
                                                if(localVideos === 0) {
                                                    // No video, at least for now: show a placeholder
                                                    video.append(
                                                        '<div class="no-video-container">' +
                                                            '<i class="fa-solid fa-video fa-xl no-video-icon"></i>' +
                                                            '<span class="no-video-text">No webcam available</span>' +
                                                        '</div>');
                                                    
                                                }
                                            }
                                            delete localTracks[trackId];
                                            return;
                                        }
                                        // If we're here, a new track was added
                                        mystream = localTracks[trackId];
                                        if(mystream) {
                                            // We've been here already
                                            return;
                                        }
                                        if(track.kind === "audio") {
                                            // We ignore local audio tracks, they'd generate echo anyway
                                        } else {
                                            // New video track: create a stream out of it
                                            localVideos++;
                                            mystream = new MediaStream([track]);
                                            localTracks[trackId] = mystream;
                                            Janus.log("Created local stream:", mystream);
                                            Janus.log(mystream.getTracks());
                                            Janus.log(mystream.getVideoTracks());
                                            Janus.attachMediaStream(video, mystream);
                                        }
                                        if(vroomHandle.webrtcStuff.pc.iceConnectionState !== "completed" &&
                                        vroomHandle.webrtcStuff.pc.iceConnectionState !== "connected") {
                                            Janus.log(`Publishing...`)
                                        }
                                    },
                                    oncleanup: function () {
                                        Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
                                        mystream = null;
                                        delete feedStreams[myid];
                                        localTracks = {};
                                    }
                                });
                        },
                        error: function(error) {
                            Janus.error(error);
                            alert(error);

                        },
                        destroyed: function() {
                            console.log('destroyed');
                        }
                    });
        }});

        // Helper to escape XML tags
        function escapeXmlTags(value) {
            if(value) {
                let escapedValue = value.replace(new RegExp('<', 'g'), '&lt');
                escapedValue = escapedValue.replace(new RegExp('>', 'g'), '&gt');
                return escapedValue;
            }
        }
    };

    render() {
        return (
            <div className="App">
                <header className="App-header">
                    <p>
                        Welcome to <code>Reunitus</code> video room (powered by Janus)
                    </p>
                    <div>
                        <div id="myvideo" className="container shorter">
                            <video id="localvideo" className="rounded centered" width="100%" height="100%" autoPlay playsInline muted="muted"></video>
                        </div>
                        {/*<div className="panel-body" id="videolocal"></div>*/}
                    </div>
                </header>
                <h3 id="title"></h3>
                <Container>
                    <Row>
                        <Col>
                            <div id="videoremote1" className="container">
                                <img src={offline} id="img1" className="card-media-image" style={{ width: "300px", height: "250px" }}></img>
                            </div>
                            <h3 id="callername">{'Participant 1'}</h3>
                        </Col>
                        <Col>
                            <div id="videoremote2" className="container">
                                <img src={offline} id="img1_2" className="card-media-image" style={{ width: "300px", height: "250px" }}></img>
                            </div>
                            <h3 id="callername">{'Participant 2'}</h3>
                        </Col>
                        <Col>
                            <div id="videoremote3" className="container">
                                <img src={offline} id="img1_3" className="card-media-image" style={{ width: "300px", height: "250px" }}></img>
                            </div>
                            <h3 id="callername">{'Participant 3'}</h3>
                        </Col>
                    </Row>
                </Container>
            </div>
        );
    }
}

export default Room;
