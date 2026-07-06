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
$._AQV_.placeVoice = function (wavPath, audioTrack, offsetSec) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return 'ERR:NO_SEQUENCE';
        var pos = seq.getPlayerPosition().seconds + Number(offsetSec || 0);
        var bin = $._AQV_.getVoiceBin();
        var wavItem = $._AQV_.ensureImported(bin, wavPath);
        if (!wavItem) return 'ERR:IMPORT_WAV';
        var tIdx = Math.floor(Number(audioTrack)) - 1;
        if (isNaN(tIdx) || tIdx < 0) tIdx = 0;
        if (tIdx >= seq.audioTracks.numTracks) tIdx = seq.audioTracks.numTracks - 1;
        if (seq.audioTracks[tIdx].isLocked()) return 'ERR:TRACK_LOCKED';
        seq.audioTracks[tIdx].overwriteClip(wavItem, pos);
        return 'OK:AUDIO';
    } catch (e) {
        return 'ERR:' + e.toString();
    }
};

// list selected audio clips (fallback: all clips on targeted audio tracks)
$._AQV_.getSelectedAudioClips = function () {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return 'ERR:NO_SEQUENCE';
        var out = [];
        var push = function (c) {
            try {
                if (c && c.mediaType === 'Audio' && c.projectItem && !c.projectItem.isSequence()) {
                    out.push(c.projectItem.getMediaPath() + '\t' + c.start.seconds + '\t' + c.end.seconds);
                }
            } catch (e1) {}
        };
        var sel = seq.getSelection();
        if (sel && sel.length > 0) {
            for (var i = 0; i < sel.length; i++) push(sel[i]);
        }
        if (out.length === 0) {
            for (var t = 0; t < seq.audioTracks.numTracks; t++) {
                if (seq.audioTracks[t].isTargeted()) {
                    for (var j = 0; j < seq.audioTracks[t].clips.numItems; j++) push(seq.audioTracks[t].clips[j]);
                }
            }
        }
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
