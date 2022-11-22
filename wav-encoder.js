"use strict";

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


const floatToPCM = (output, offset, input, bitsPrSample, littleEndian = true, bitsPrByte = 8) => {

    /*
        output: a DataView
        offset: where to start writing to output
        input: array or Float32Array of float values in the range -1 to 1
        bitsPrSample: number of bits to be used to encode each sample
        littleEndian: write the least significant byte first, if bitsPrSample > 8
        bitsPrByte: split each sample into bytes with this amount of bits pr byte 
    */

    const negRange = 1 << (bitsPrSample - 1);
    const posRange = negRange - 1;
    const bytesPrSample = Math.ceil(bitsPrSample / bitsPrByte);
    const mask = (1 << bitsPrByte) - 1;

    console.log({mask});
    const insertByte = (value, index) => output.setUint8(offset + index, value);


    for (let i = 0; i < input.length; i++, offset += bytesPrSample) {

        const s = Math.max(-1, Math.min(1, input[i]));
        const value = Math.floor(s < 0 ? s * negRange : s * posRange);

        const bytes = new Uint8Array();
        for (let b = 0; b < bytesPrSample; b += 1) {
            bytes[b] = (value >> (bitsPrByte * b)) & mask;
        }

        if (littleEndian) {
            bytes.forEach(insertByte);
        } else {
            bytes.reverse().forEach(insertByte);
        }
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

export {
    encodeWAV,
    floatToPCM,
    interleave
};

