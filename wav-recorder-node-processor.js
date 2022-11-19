/*
wav-recorder-node-processor.js © 2022 by Erik E. Seierstad is licensed under CC BY-SA 4.0:

http://creativecommons.org/licenses/by-sa/4.0/?ref=chooser-v1
*/

import {encodeWAV} from "./wav-encoder.js";

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

