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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ideContext_1 = require("./ideContext");
const sidebarProvider_1 = require("./sidebarProvider");
const contextOutput = vscode.window.createOutputChannel('Voice Pair Programmer');
let isVoicePairRunning = false;
let lastCapturedContext = null;
let statusBarItem;
let sidebarProvider;
function activate(context) {
    console.log('Voice Pair Programmer is active.');
    sidebarProvider = new sidebarProvider_1.VoicePairSidebarProvider(context.extensionUri);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'voice-pair-programmer.toggleSession';
    updateStatusBarItem();
    statusBarItem.show();
    const sidebarRegistration = vscode.window.registerWebviewViewProvider(sidebarProvider_1.VoicePairSidebarProvider.viewType, sidebarProvider);
    const toggleSession = vscode.commands.registerCommand('voice-pair-programmer.toggleSession', () => {
        isVoicePairRunning = !isVoicePairRunning;
        updateStatusBarItem();
        sidebarProvider.setSessionRunning(isVoicePairRunning);
        const status = isVoicePairRunning ? 'started' : 'paused';
        vscode.window.showInformationMessage(`Voice Pair Programmer ${status}.`);
    });
    const captureContext = vscode.commands.registerCommand('voice-pair-programmer.captureContext', async () => {
        const capturedContext = await (0, ideContext_1.getCapturedContext)();
        lastCapturedContext = capturedContext;
        sidebarProvider.setLastContext(capturedContext, isVoicePairRunning);
        contextOutput.clear();
        contextOutput.appendLine(JSON.stringify(capturedContext, null, 2));
        contextOutput.show(true);
        vscode.window.showInformationMessage('Captured Voice Pair Programmer context.');
    });
    context.subscriptions.push(sidebarRegistration, toggleSession, captureContext, statusBarItem, contextOutput);
}
function updateStatusBarItem() {
    statusBarItem.text = isVoicePairRunning ? '$(debug-pause) Voice Pair' : '$(debug-start) Voice Pair';
    statusBarItem.tooltip = isVoicePairRunning
        ? 'Pause Voice Pair Programmer'
        : 'Start Voice Pair Programmer';
}
function deactivate() { }
//# sourceMappingURL=extension.js.map