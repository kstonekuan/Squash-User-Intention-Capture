# 🔥 Squash: AI-Powered Task Analyzer

> Turn your web browsing into actionable insights with AI that understands what you're actually trying to do.

A Chrome extension that records your web interactions and uses AI to analyze your tasks, understand your intent, and suggest optimizations. Perfect for UX research, process documentation, and automation planning.

## ✨ What Makes This Special

**🤖 Dual AI Analysis**
- **Chrome AI**: Private, local analysis using Chrome's built-in Gemini Nano
- **Claude AI**: Advanced cloud analysis with Anthropic's Claude
- **Roasting Mode**: Get hilarious roasts about your task inefficiencies 🔥

**📊 Smart Task Understanding** 
- Records every click, type, scroll, and navigation
- Analyzes your intent behind each action
- Suggests workflow optimizations
- Generates automation-ready instructions

**🔒 Privacy First**
- All data stays on your device (unless using cloud AI)
- Passwords automatically masked
- No tracking, no analytics, no data collection

## 🚀 Quick Start

### 1. Install the Extension

```bash
# Clone this repo
git clone https://github.com/yourusername/user-intent-extension.git
cd user-intent-extension

# Install dependencies
npm install

# Build the extension
npm run build
```

### 2. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" and select the `dist` folder
4. Click the extension icon to open the side panel

### 3. Start Recording

1. Hit **"Start Mark"** to begin recording a task
2. Do your thing on any website
3. Hit **"Stop Mark"** when done
4. Get instant AI analysis of what you just did! 🎉

## ⚙️ Setup Options

### For Chrome AI (Recommended)
- **Requirements**: Chrome 131+
- **Setup**: Nothing! It just works locally and privately

### For Claude AI (Optional)
1. Get an [Anthropic API key](https://console.anthropic.com/)
2. Create a `.env` file:
   ```env
   VITE_ANTHROPIC_API_KEY=your_api_key_here
   ```
3. Rebuild: `npm run build`
4. Switch to Claude in the Debug tab

## 🎯 What You Get

### 📈 Task Analysis
- **Intent Recognition**: "User is trying to book a flight"
- **Step Breakdown**: Each action with its purpose explained
- **Optimization Tips**: "You could bookmark this page for faster access"
- **Automation Recipe**: Natural language instructions for browser automation

### 🔥 Roasting Mode
Enable in Debug tab for hilarious takes on your productivity:
> "😂 Took 12 clicks to do what could've been done with Ctrl+F... efficiency is not your strong suit 🤦‍♂️"

### 📊 Rich Data Export
- Export complete interaction data
- Analysis history with timestamps
- Compressed JSON format for easy sharing

## 🛠️ Development

```bash
# Development with hot reload
npm run dev

# Lint and format
npm run lint

# Build for production
npm run build
```

## 🔍 Use Cases

- **UX Research**: Understand how users really interact with your app
- **Process Documentation**: Auto-generate step-by-step guides
- **Automation Planning**: Get prompts ready for Playwright/Selenium
- **Training Materials**: Show the "why" behind each interaction
- **Bug Reports**: Detailed reproduction steps with context
- **Workflow Optimization**: Find inefficiencies in complex tasks

## 🏗️ Tech Stack

- **Frontend**: TypeScript + Chrome Extensions Manifest V3
- **AI Integration**: Chrome AI API + Anthropic Claude
- **Recording**: Custom event capture system
- **Storage**: IndexedDB with compression
- **Build**: Vite + CRXJS plugin

## 📱 Screenshots

[Add screenshots here of the side panel, analysis results, roasting mode, etc.]

## 🤝 Contributing

Want to make this even better? 

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with Chrome's experimental AI APIs
- Powered by Anthropic's Claude for advanced analysis
- Uses rrweb for robust event recording

---

**Made with ❤️ for anyone tired of explaining what they just did on a website**

*Star ⭐ this repo if it helped you understand your own browsing habits!*