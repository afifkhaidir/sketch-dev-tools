/* globals AppController, NSWorkspace, MSTheme */
/* eslint-disable global-require */
import Settings from 'sketch/settings'
import BrowserWindow from 'sketch-module-web-view'
import { getWebview } from 'sketch-module-web-view/remote'
import { prepareValue } from 'sketch-utils'
import getSketchState, {
  getPageMetadata,
  getLayerMetadata,
} from './get-sketch-state'
import {
  SET_TREE,
  SET_PAGE_METADATA,
  SET_LAYER_METADATA,
  SET_SCRIPT_RESULT,
} from '../shared-actions'
import { identifier } from '../debugger'
import { runScript, clearScriptsCache, runCommand } from './run-script'

function listenToActions(enabled) {
  AppController.sharedInstance()
    .pluginManager()
    .setWilcardsEnabled(enabled)
}

export default function() {
  const existingWebview = getWebview(identifier)
  if (existingWebview) {
    if (existingWebview.isVisible()) {
      // close the devtool if it's open
      existingWebview.close()
    }
    return
  }

  const bounds = Settings.settingForKey('bounds') || { width: 830, height: 400 }

  const browserWindow = new BrowserWindow({
    identifier,
    ...bounds,
    minWidth: 700,
    minHeight: 300,
    minimizable: false,
    maximizable: false,
    hidesOnDeactivate: false,
    alwaysOnTop: Settings.settingForKey('alwaysOnTop') || false,
    fullscreenable: false,
    acceptFirstMouse: true,
    title: 'Sketch DevTools',
    resizable: true,
    show: false,
  })

  browserWindow.loadURL(require('../resources/webview.html'))

  const settings = {
    withAncestors: Settings.settingForKey('withAncestors') || false,
    alwaysOnTop: Settings.settingForKey('alwaysOnTop') || false,
    theme:
      typeof MSTheme !== 'undefined' && MSTheme.sharedTheme().isDark()
        ? 'dark'
        : 'light',
    showTimestamps: Settings.settingForKey('showTimestamps') || false,
    sourcemaps:
      typeof Settings.settingForKey('sourcemaps') !== 'undefined'
        ? Settings.settingForKey('sourcemaps')
        : true,
    playgroundEditorWidth:
      typeof Settings.settingForKey('playgroundEditorWidth') !== 'undefined'
        ? Settings.settingForKey('playgroundEditorWidth')
        : 300,
    quickLookWidth:
      typeof Settings.settingForKey('quickLookWidth') !== 'undefined'
        ? Settings.settingForKey('quickLookWidth')
        : 300,
    nativeElements: Settings.settingForKey('nativeElements') || false,
  }

  browserWindow.webContents.insertJS(
    `window.initialSettings = ${JSON.stringify(settings)}`
  )

  browserWindow.once('ready-to-show', () => {
    browserWindow.show()
  })

  function storePosition() {
    Settings.setSettingForKey('bounds', browserWindow.getBounds())
  }

  browserWindow.on('moved', storePosition)
  browserWindow.on('resize', storePosition)

  browserWindow.on('closed', () => {
    listenToActions(false)
  })

  browserWindow.webContents.on('listenToActions', enabled => {
    listenToActions(enabled)
  })

  browserWindow.webContents.on('openFile', file => {
    NSWorkspace.sharedWorkspace().openFile(file)
  })

  browserWindow.webContents.on('getSketchState', () => {
    const state = getSketchState({ native: settings.nativeElements })

    browserWindow.webContents
      .executeJavaScript(
        `sketchBridge(${JSON.stringify({ name: SET_TREE, payload: state })})`
      )
      .catch(console.error)
  })

  browserWindow.webContents.on('setSetting', (key, value) => {
    settings[key] = value
    Settings.setSettingForKey(key, value)

    if (String(key) === 'alwaysOnTop') {
      browserWindow.setAlwaysOnTop(value)
    }
  })

  browserWindow.webContents.on('getPageMetadata', (pageId, docId) => {
    const state = getPageMetadata(pageId, docId, {
      native: settings.nativeElements,
    })

    browserWindow.webContents
      .executeJavaScript(
        `sketchBridge(${JSON.stringify({
          name: SET_PAGE_METADATA,
          payload: { pageId, docId, state },
        })})`
      )
      .catch(console.error)
  })

  browserWindow.webContents.on('getLayerMetadata', (layerId, pageId, docId) => {
    const state = getLayerMetadata(layerId, pageId, docId, {
      native: settings.nativeElements,
    })

    browserWindow.webContents
      .executeJavaScript(
        `sketchBridge(${JSON.stringify({
          name: SET_LAYER_METADATA,
          payload: { layerId, pageId, docId, state },
        })})`
      )
      .catch(console.error)
  })

  browserWindow.webContents.on(
    'onRunScript',
    (script, runId, shouldCompile = true) => {
      const result = runScript(script, shouldCompile)
      browserWindow.webContents
        .executeJavaScript(
          `sketchBridge(${JSON.stringify({
            name: SET_SCRIPT_RESULT,
            payload: {
              result: prepareValue(result),
              id: runId,
            },
          })})`
        )
        .catch(console.error)
    }
  )

  browserWindow.webContents.on('onRunCommand', (command, runId) => {
    runCommand(command)
      .catch(err => err)
      .then(result => {
        browserWindow.webContents
          .executeJavaScript(
            `sketchBridge(${JSON.stringify({
              name: SET_SCRIPT_RESULT,
              payload: {
                result: prepareValue(result || 'done'),
                id: runId,
              },
            })})`
          )
          .catch(console.error)
      })
  })

  browserWindow.webContents.on('clearScriptsCache', () => {
    clearScriptsCache()
  })
}

export function onShutdown() {
  const existingWebview = getWebview(identifier)
  if (existingWebview) {
    existingWebview.close()
  }
}
