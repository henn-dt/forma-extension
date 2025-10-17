# Forma Building Color Extension

A React-based Forma extension that allows users to select and color buildings within Forma. Built following the [official Forma tutorial](https://aps.autodesk.com/en/docs/forma/v1/embedded-views/tutorial/).

![Forma Extension Screenshot](/ScreenshotFormExtension.png)

## Features

- 🏗️ Building selection and identification
- 🎨 Color picker for building customization
- 🔍 Opacity control for transparency effects
- ↩️ Reset functionality to restore original state
- 📊 Display of total building count

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (version 14 or higher)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)
- [Forma](https://forma.autodesk.com/) account and access

## Installation

1. Create a new React project:
```bash
npm init react
```

2. Install the Forma SDK:
```bash
npm install forma-embedded-view-sdk
```

3. Clone this repository:
```bash
git clone [your-repository-url]
cd my-react-forma
```

4. Install remaining dependencies:
```bash
npm install
```

5. Start the development server:
```bash
npm run dev
```

## Tutorial Reference

This extension was built following the [Forma Embedded Views Tutorial](https://aps.autodesk.com/en/docs/forma/v1/embedded-views/tutorial/). While the original tutorial uses Preact, this implementation uses React, which works equally well with the Forma SDK.

Key differences from tutorial:
- Uses React instead of Preact
- Same functionality and SDK usage
- Compatible with latest Forma SDK version

[Rest of the README content remains the same as before...]