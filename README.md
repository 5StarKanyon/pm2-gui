# PM2 GUI Manager

<p align="center">
  <a href="https://github.com/TF2-Price-DB/pm2-gui">
    <img src="https://img.shields.io/github/stars/TF2-Price-DB/pm2-gui?style=social" alt="GitHub stars">
  </a>
  <a href="https://github.com/TF2-Price-DB/pm2-gui/actions">
    <img src="https://github.com/TF2-Price-DB/pm2-gui/actions/workflows/main.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://github.com/TF2-Price-DB/pm2-gui/blob/main/.eslintrc.js">
    <img src="https://img.shields.io/badge/code%20style-eslint-blue.svg" alt="ESLint">
  </a>
  <a href="https://github.com/TF2-Price-DB/pm2-gui/blob/main/.prettierrc">
    <img src="https://img.shields.io/badge/code%20style-prettier-ff69b4.svg" alt="Prettier">
  </a>
  <a href="https://nodejs.org/en/">
    <img src="https://img.shields.io/badge/node-%3E=16.0.0-green.svg" alt="Node version">
  </a>
</p>

---

> **A modern, cross-platform Electron GUI for managing your local PM2 processes.**

---

## 🚀 Quick Start

### 1. Clone the Repository

```sh
git clone https://github.com/TF2-Price-DB/pm2-gui.git
cd pm2-gui
```

### 2. Install Prerequisites

- [Node.js](https://nodejs.org/) (v16+ recommended)
- [PM2](https://pm2.keymetrics.io/) globally:

```sh
npm install -g pm2
```

### 3. Install Dependencies

```sh
npm install
```

### 4. Start the App

```sh
npm start
```

---

## ✨ Features

- View running PM2 processes in a modern table
- Start, stop, restart, and delete processes
- View and search logs (with live streaming)
- View and (where supported) edit process configs
- Start new processes with custom scripts
- Modern Bootstrap-based GUI
- Electron-based cross-platform GUI (Windows supported, others coming soon)

---

## 🖥️ Usage Guide

1. **Ensure PM2 is running and accessible in your system PATH.**
2. **Start the app:**
   - The main window lists all running PM2 processes.
3. **Start a new process:**
   - Click <kbd>Start New Process</kbd> and enter the script path.
4. **View process details:**
   - Click a process name to open a modal with details, live logs, and config.
5. **Edit config & restart:**
   - Where supported, edit config in the modal and restart the process.
6. **Process actions:**
   - Use the main table to start, stop, restart, or delete any process.

> **Tip:** All actions are available from the main table for quick management.

---

## 📸 Screenshots

<!--
Add screenshots here for visual appeal. Example:

<p align="center">
  <img src="docs/screenshot-main.png" width="600" alt="Main UI" />
  <img src="docs/screenshot-modal.png" width="600" alt="Process Modal" />
</p>
-->

---

## ⚙️ Configuration & Advanced Usage

- The app interacts with your local PM2 instance.
- Make sure PM2 is installed and accessible in your system PATH.
- Supports most PM2 actions directly from the GUI.
- More advanced features and cross-platform support are coming soon.

---

## 🤝 Contributing

Pull requests, issues, and suggestions are welcome! Please open an issue or PR on [GitHub](https://github.com/TF2-Price-DB/pm2-gui).

---

## 📄 License

MIT

---
