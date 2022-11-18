let wavCounter = 1;

class WavRecorderNode extends AudioWorkletNode {

    constructor (context, workletOptions = {numberOfInputs: 1, numberOfOutputs: 0}) {
        super(context, "wav-recorder-node-processor", workletOptions);
        this.port.onmessage = this.messageHandler.bind(this);
        this.buttonHandler = this.buttonHandler.bind(this);
        this.initHtml();
    }

    initHtml () {
        this.domElement = document.createElement("fieldset");
        this.domElement.classList.add("recorder");
        const legend = document.createElement("legend");
        legend.innerText = "Recorder";
        this.domElement.appendChild(legend);

        const recButton = document.createElement("button");
        recButton.innerText = "record";
        recButton.value = "record";
        recButton.addEventListener("click", this.buttonHandler);
        this.domElement.appendChild(recButton);

        const stopButton = document.createElement("button");
        stopButton.innerText = "stop";
        stopButton.value = "stop";
        stopButton.addEventListener("click", this.buttonHandler);
        this.domElement.appendChild(stopButton);

        const pauseButton = document.createElement("button");
        pauseButton.innerText = "pause";
        pauseButton.value = "pause";
        pauseButton.addEventListener("click", this.buttonHandler);
        this.domElement.appendChild(pauseButton);
    }

    addWavLink (data) {
        const blob = new Blob([data], {type: "audio/wav"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("download", `wav-fil-${wavCounter}.wav`);
        link.innerText = "last ned wav-fil " + wavCounter++;
        link.href = url;
        this.domElement.appendChild(link);
    }

    full () {
        const full = document.createElement("span");
        full.classList.add("full");
        full.innerText = "full";
        this.domElement.appendChild(full);
    }

    get html () {
        return this.domElement;
    }

    buttonHandler (event) {
        const {value} = event.target;
        switch (value) {
            case "record":
                this.record();
                break;
            case "stop":
                this.stop();
                break;
            case "pause":
                this.pause();
                break;
        }
    }

    messageHandler (event) {
        const {
            type,
            message,
            data
        } = event.data;

        switch (type) {
            case "data": {
                switch (message) {
                    case "wav":
                        this.addWavLink(data);
                        break;

                    default:
                        console.log(event);
                }
                break;
            }
            case "status": {
                switch (message) {
                    case "full":
                        this.full();
                        break;
                }
            }
        }
    }

    record () {
        this.port.postMessage(JSON.stringify({"type": "command", "message": "record"}));
    }

    pause () {
        this.port.postMessage(JSON.stringify({"type": "command", "message": "pause"}));
    }

    stop () {
        this.port.postMessage(JSON.stringify({"type": "command", "message": "stop"}));
    }

    destroy () {
        this.port.postMessage(JSON.stringify({"type": "command", "message": "destroy"}));
    }
}

export { WavRecorderNode };
