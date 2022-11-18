/*
wav-recorder-node-processor.js © 2022 by Erik E. Seierstad is licensed under CC BY-SA 4.0:

http://creativecommons.org/licenses/by-sa/4.0/?ref=chooser-v1
*/

const buffersReducer = (acc, buffer) => ({
    length: acc.length + buffer.length,
    numberOfChannels: Math.max(acc.numberOfChannels, buffer.numberOfChannels)
});


const mergeBuffers = (buffers = []) => {
    /* Merge an array of AudioBuffers to a single AudioBuffer */

    const {length, numberOfChannels} = buffers.reduce(buffersReducer);
    const result = new AudioBuffer({length, numberOfChannels, sampleRate: buffers[0].sampleRate});
    let index = 0;

    for (const b of buffers) {
        for (let c = 0; c < b.numberOfChannels; i += 10) {
            result.copyToChannel(b.getChannelData(c), c, index);
        }
        index += b.length;
    }

    return result;
};


const interleave = (inputs = []) => {

    const length = inputs.reduce((acc, input) => acc + input.length, 0);
    const numberOfInputs = inputs.length;
    const result = new Float32Array(length);

    let resultIndex = 0,
        inputIndex = 0;

    while (resultIndex < length) {
        for (let channel = 0; channel < numberOfInputs; channel += 1) {
            result[resultIndex += 1] = inputs[channel][inputIndex];
        }
        inputIndex += 1;
    }

    return result;
};


const floatToPCM = (output, offset, input, bitsPrSample) => {

    const negRange = 1 << (bitsPrSample - 1);
    const posRange = negRange - 1;

    for (let i = 0; i < input.length; i++, offset += 2) {

        const s = Math.max(-1, Math.min(1, input[i]));
        const value = s < 0 ? s * negRange : s * posRange;

        output.setInt16(offset, value, true);
    }
};

const copyFloats = (output, offset, input) => {

    for (let i = 0; i < input.length; i += 1, offset += 4) {
        const value = Math.max(-1, Math.min(1, input[i]));
        output.setFloat32(offset, value, true);
    }
};


const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i += 1) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};


const WAVE_FORMAT_PCM = 0x0001;
const WAVE_FORMAT_IEEE_FLOAT = 0x0003;


function encodeWAV(recording, sampleRate, float = false, bitsPrSample = (float ? 32 : 16)) {
    const channelCount = recording.length;
    const sampleCount = recording[0].length;
    const bytesPrSample = Math.ceil(bitsPrSample / 8);
    const dataLength = channelCount * sampleCount * bytesPrSample;

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const samples = interleave(recording);

    const fmtChunkDataLength = 16;
    const fmtChunkLength = fmtChunkDataLength + 4;

    const dataChunkLength = dataLength + 8; // "data" + size (Uint32) + data 

    let index = 0;

    /* RIFF identifier */
    writeString(view, index, "RIFF");
    index += 4;
    const riffLength = index;

    /* RIFF chunk length */
    view.setUint32(index, 8 + fmtChunkLength + dataChunkLength, true);
    index += 4;

    /* RIFF type */
    writeString(view, index, "WAVE");
    index += 4;

    /* format chunk identifier */
    writeString(view, index, "fmt ");
    index += 4;

    /* format chunk length */
    view.setUint32(index, fmtChunkDataLength, true);
    index += 4;

    /* sample format */ 
    view.setUint16(index, (float ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM), true);
    index += 2;

    /* channel count */
    view.setUint16(index, channelCount, true);
    index += 2;

    /* sample rate */
    view.setUint32(index, sampleRate, true);
    index += 4;

    /* byte rate (sample rate * block align) */
    view.setUint32(index, sampleRate * channelCount * bytesPrSample, true);
    index += 4;

    /* block align (channel count * bytes per sample) */
    view.setUint16(index, channelCount * bytesPrSample, true);
    index += 2;

    /* bits per sample */
    view.setUint16(index, bitsPrSample, true);
    index += 2;


    /* data chunk identifier */
    writeString(view, index, "data");
    index += 4;

    /* data chunk length */
    view.setUint32(index, samples.length * 2, true);
    index += 4;

    if (float) {
        copyFloats(view, index, samples);
    } else {
        floatToPCM(view, index, samples, bitsPrSample);
    }

    return view;
}

const sampleRate = 44100;
const chunkDuration = 5;
const bufferLength = sampleRate * chunkDuration;
const numberOfChannels = 2;


class WavRecorderNodeProcessor extends AudioWorkletProcessor {

    constructor () {
        super();

        this.initRecording();
        this.port.onmessage = this.messageHandler.bind(this);
    }

    record () {
        if (this.paused) {
            this.paused = false;
        }
    }

    initRecording () {
        this.recording = Array(numberOfChannels).fill().map(() => ([new Float32Array(bufferLength)]));
        this.index = 0;
        this.chunkIndex = 0;
        this.currentChunk = 0;
        this.paused = true;
        this.isFull = false;
    }

    addChunk () {
        this.recording.forEach((chunks, channel) => chunks.push(new Float32Array(bufferLength)));
        this.currentChunk += 1;
        this.chunkIndex = 0;
        console.log(this.currentChunk, this.index);
    }

    get trimmedRecording () {
        const result = this.recording.map(channel => {
            const mergedChannel = new Float32Array(this.index);

            channel.forEach((chunk, chunkNumber) => {
                if (chunkNumber !== this.currentChunk) {
                    mergedChannel.set(chunk, chunkNumber * bufferLength);
                } else {
                    mergedChannel.set(chunk.subarray(0, this.chunkIndex), chunkNumber * bufferLength);
                }
            });
            return mergedChannel;
        });
        return result;
    }

    sendWav () {
        const encoded = encodeWAV(this.trimmedRecording, sampleRate, true);

        this.port.postMessage({
            "type": "data",
            "message": "wav",
            "data": encoded.buffer
        }, [encoded.buffer]);
    }

    stop () {
        this.paused = true;
        this.sendWav();
        this.initRecording();
    }

    pause () {
        this.paused = true;
    }

    destroy () {
        this.destroyed = true;
    }


    /*
    listMetadata () {
        this.port.postMessage(JSON.stringify({
            "type": "report",
            "message": "list",
            "data": {
                "recordings": this.recordings.map()
            }
        }));
    }
    */

    messageHandler (event) {
        const {
            type = "",
            message,
            data,
            index
        } = JSON.parse(event.data);

        switch (type) {
            case "command": {

                switch (message) {
                    case "record":
                        this.record();
                        break;

                    case "pause":
                        this.pause();
                        break;

                    case "stop":
                        this.stop();
                        break;

                    case "destroy":
                        this.destroy();
                        break;
                }
                break;
            }
            case "set": {
                switch (message) {
                    case "name":
                        this.records[index].name = data;
                        this.reportName(index);
                        break;

                    case "position":
                        this.position = parseFloat(data);
                        break;

                }
                break;
            }

            case "get": {
                switch (message) {
                    /*
                    case "records":
                        this.port.postMessage(JSON.stringify({
                            "type": "report",
                            "message": "recordings",
                            "data": this.recordings

                        }))
                        console.log("BetterBufferSource: loop status requested");
                        break;

                    case "position":
                        this.port.postMessage(JSON.stringify({
                            "type": "report",
                            "message": "position",
                            "data": this.position
                        }));
                        break;
                    */

                    default:
                        console.log({event});
                        console.log("BetterBufferSource: unhandled property request");
                }
            }

        }
    }

    full () {
        this.isFull = true;
        this.port.postMessage(JSON.stringify({
            "type": "status",
            "message": "full"
        }));
    }

    process (inputs) {
        if (!this.isFull && !this.paused && inputs[0][0]) {
            const input = inputs[0];

            if (this.chunkIndex + input[0].length < bufferLength) {
                for (let channel = 0; channel < numberOfChannels; channel += 1) {
                    this.recording[channel][this.currentChunk].set(input[channel], this.chunkIndex);
                }
                this.index += input[0].length;
                this.chunkIndex += input[0].length;
            } else {

                for (let index = 0; index < input[0].length; index += 1) {

                    if (this.chunkIndex === bufferLength) {
                        this.addChunk();
                        //this.full();
                        //break;
                    }

                    for (let channel = 0; channel < numberOfChannels; channel += 1) {
                        this.recording[channel][this.currentChunk].set([input[channel][index]], this.chunkIndex);
                    }

                    this.index += 1;
                    this.chunkIndex += 1;
                }
            }
        }
        return !this.destroyed;
    }


}

registerProcessor("wav-recorder-node-processor", WavRecorderNodeProcessor);

