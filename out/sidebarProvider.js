"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoicePairSidebarProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const sidebarState_1 = require("./sidebarState");
class VoicePairSidebarProvider {
    extensionUri;
    static viewType = 'voice-pair-programmer.sidebar';
    view;
    isRunning = false;
    lastContext = null;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
        };
        webviewView.webview.onDidReceiveMessage((message) => {
            if (message.command === 'toggleSession') {
                vscode.commands.executeCommand('voice-pair-programmer.toggleSession');
            }
            if (message.command === 'captureContext') {
                vscode.commands.executeCommand('voice-pair-programmer.captureContext');
            }
        });
        webviewView.webview.html = this.getHtml(webviewView.webview);
    }
    setSessionRunning(isRunning) {
        this.isRunning = isRunning;
        this.postState(this.getState());
    }
    setLastContext(capturedContext, isRunning) {
        this.lastContext = capturedContext;
        this.isRunning = isRunning;
        this.postState(this.getState());
    }
    postState(state) {
        this.view?.webview.postMessage({
            type: 'state',
            state,
        });
    }
    getState() {
        return (0, sidebarState_1.getSidebarState)(this.isRunning, this.lastContext);
    }
    getHtml(webview) {
        const nonce = getNonce();
        const templatePath = path.join(this.extensionUri.fsPath, 'media', 'sidebar.html');
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'));
        const initialState = JSON.stringify(this.getState()).replace(/</g, '\\u003c');
        return fs.readFileSync(templatePath, 'utf8')
            .replaceAll('${cspSource}', webview.cspSource)
            .replaceAll('${nonce}', nonce)
            .replaceAll('${styleUri}', String(styleUri))
            .replaceAll('${scriptUri}', String(scriptUri))
            .replaceAll('${initialState}', initialState);
    }
}
exports.VoicePairSidebarProvider = VoicePairSidebarProvider;
function getNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return nonce;
}
//# sourceMappingURL=sidebarProvider.js.map