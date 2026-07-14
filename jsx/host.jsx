// VoiceDesk - ExtendScript host (ASCII only)
if (typeof $._AQV_ === 'undefined') { $._AQV_ = {}; }

$._AQV_.getVoiceBin = function () {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var c = root.children[i];
        if (c && c.type === ProjectItemType.BIN && c.name === 'VoiceDesk') { return c; }
    }
    return root.createBin('VoiceDesk');
};

$._AQV_.getVoiceSubBin = function (subName) {
    var root = $._AQV_.getVoiceBin();
    if (!subName) return root;
    for (var i = 0; i < root.children.numItems; i++) {
        var c = root.children[i];
        if (c && c.type === ProjectItemType.BIN && c.name === subName) { return c; }
    }
    return root.createBin(subName);
};

$._AQV_.findByPath = function (bin, p) {
    var norm = String(p).replace(/\\/g, '/').toLowerCase();
    for (var j = 0; j < bin.children.numItems; j++) {
        var it = bin.children[j];
        try {
            if (it && it.getMediaPath && String(it.getMediaPath()).replace(/\\/g, '/').toLowerCase() === norm) return it;
        } catch (e1) {}
    }
    return null;
};

$._AQV_.ensureImported = function (bin, p) {
    var item = $._AQV_.findByPath(bin, p);
    if (!item) {
        app.project.importFiles([p], true, bin, false);
        item = $._AQV_.findByPath(bin, p);
    }
    return item;
};

// place audio clip at playhead + offsetSec on given track (1-based)
// binName: optional sub-bin name under VoiceDesk bin (e.g. engine+character name)
$._AQV_.placeVoice = function (wavPath, audioTrack, offsetSec, binName) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return 'ERR:NO_SEQUENCE';
        var pos = seq.getPlayerPosition().seconds + Number(offsetSec || 0);
        var bin = $._AQV_.getVoiceSubBin(binName);
        var wavItem = $._AQV_.ensureImported(bin, wavPath);
        if (!wavItem) return 'ERR:IMPORT_WAV';
        var tIdx = Math.floor(Number(audioTrack)) - 1;
        if (isNaN(tIdx) || tIdx < 0) tIdx = 0;
        if (tIdx >= seq.audioTracks.numTracks) tIdx = seq.audioTracks.numTracks - 1;
        if (seq.audioTracks[tIdx].isLocked()) return 'ERR:TRACK_LOCKED';
        seq.audioTracks[tIdx].overwriteClip(wavItem, pos);
        var eps = 0.001;
        var track = seq.audioTracks[tIdx];
        var found = null;
        var bestDiff = -1;
        for (var ci = 0; ci < track.clips.numItems; ci++) {
            var cc = track.clips[ci];
            try {
                var cs = cc.start.seconds;
                if (Math.abs(cs - pos) <= eps) { found = cc; break; }
                var diff = Math.abs(cs - pos);
                if (bestDiff < 0 || diff < bestDiff) { bestDiff = diff; found = cc; }
            } catch (e3) {}
        }
        if (found) {
            return 'OK:AUDIO\t' + found.start.seconds + '\t' + found.end.seconds;
        }
        return 'OK:AUDIO';
    } catch (e) {
        return 'ERR:' + e.toString();
    }
};

// list selected audio clips (fallback: all clips on targeted audio tracks)
// output format per line: mediaPath\tstart\tend\ttrackIndex (trackIndex is 1-based)
// note: seq.getSelection() is not used because there is no reliable public API
// to look up which track a selected clip belongs to. instead this loops
// seq.audioTracks by index and checks clip.isSelected() so the track index
// is always known.
$._AQV_.getSelectedAudioClips = function () {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return 'ERR:NO_SEQUENCE';
        var selOut = [];
        var tgtOut = [];
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
            var tr = seq.audioTracks[t];
            var targeted = tr.isTargeted();
            for (var j = 0; j < tr.clips.numItems; j++) {
                var c = tr.clips[j];
                try {
                    if (!(c && c.mediaType === 'Audio' && c.projectItem && !c.projectItem.isSequence())) continue;
                    var isSel = false;
                    try { isSel = c.isSelected(); } catch (e1) { isSel = false; }
                    var line = c.projectItem.getMediaPath() + '\t' + c.start.seconds + '\t' + c.end.seconds + '\t' + (t + 1);
                    if (isSel) selOut.push(line);
                    if (targeted) tgtOut.push(line);
                } catch (e2) {}
            }
        }
        var out = (selOut.length > 0) ? selOut : tgtOut;
        if (out.length === 0) return 'ERR:NO_CLIPS';
        return 'OK:' + out.join('\n');
    } catch (e) {
        return 'ERR:' + e.toString();
    }
};

// insert SRT as caption track aligned to sequence start
$._AQV_.insertCaption = function (srtPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return 'ERR:NO_SEQUENCE';
        if (typeof seq.createCaptionTrack !== 'function') return 'ERR:NO_CAPTION_API';
        var bin = $._AQV_.getVoiceBin();
        var capItem = $._AQV_.ensureImported(bin, srtPath);
        if (!capItem) return 'ERR:IMPORT_SRT';
        seq.createCaptionTrack(capItem, 0);
        return 'OK:CAPTION';
    } catch (e) {
        return 'ERR:' + e.toString();
    }
};
