# PM2 GUI Manager

This project is an Electron + Node.js desktop application for managing and viewing PM2 instances and logs.

## Features
- View running PM2 processes
- Start/stop/restart/delete processes
- View and search logs (with live streaming)
- View and (placeholder) edit process configs
- Start new processes with custom scripts
- Modern Bootstrap-based GUI
- Electron-based cross-platform GUI (Windows supported, others coming soon)

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [PM2](https://pm2.keymetrics.io/) installed globally (`npm install -g pm2`)

### Install dependencies
```sh
npm install
```

### Run the app
```sh
npm start
```

## Configuration & Usage
- The app interacts with your local PM2 instance. Make sure PM2 is installed and accessible in your system PATH.
- Start new processes by clicking "Start New Process" and entering the script path.
- Click a process name to view details, live logs, and config in a modal.
- Edit config (where supported) and restart from the modal.
- All actions (start, stop, restart, delete) are available from the main table.

---

This app is under active development. More advanced features and cross-platform support are coming soon.
