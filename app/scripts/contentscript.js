'use strict'
/* global Mousetrap */

let Shortkeys = {}
Shortkeys.keys = []

/**
 * Helper function for fetching the full key shortcut config given a keyboard combo.
 *
 * @param keyCombo
 */
Shortkeys.fetchConfig = (keyCombo) => {
  let returnKey = false
  if (Shortkeys.keys.length > 0) {
    Shortkeys.keys.forEach((key) => {
      if (key.key === keyCombo) {
        returnKey = key
      }
    })
  }
  return returnKey
}

/**
 * Log a value in the console via the background script.
 *
 * @param value
 */
Shortkeys.log = async (value) => {
  chrome.runtime.sendMessage({
    action: "log",
    value: value,
  })
}

/**
 * Execute some code as a content script
 *
 * @param code
 */
Shortkeys.contentScript = async (code) => {
  // Create script first run variable:
  try {
    if (!window.scriptStorage) {
      // Create global. Accessable to all iFrames in the tab.
      window.scriptStorage = {}
    }
  } catch (error) { }
  try {
    let script = new Function("log", "inject", "data", code)
    script(
      Shortkeys.log,
      Shortkeys.injectScript,
      window.scriptStorage
    )
  } catch (error) { }
}

/**
 * It's a little hacky, but we have to insert JS this way rather than using executeScript() from the background JS,
 * because this way we have access to the libraries that exist on the page on any given site, such as jQuery.
 *
 * @param code
 */
Shortkeys.injectScript = (code) => {
  let script = document.createElement('script')
  script.textContent = code
  document.body.appendChild(script)
  document.body.removeChild(script)
}

/**
 * Given a key shortcut config item, carry out the action configured for it.
 * This is what happens when the user triggers the shortcut.
 *
 * @param keySetting
 */
Shortkeys.doAction = (keySetting) => {
  let action = keySetting.action
  let message = {}
  for (let attribute in keySetting) {
    message[attribute] = keySetting[attribute]
  }

  if (action === 'javascript') {
    if (keySetting.isContentScript) {
      Shortkeys.contentScript(keySetting.code)
    } else {
      Shortkeys.injectScript(keySetting.code)
    }
    return
  } else if (action === 'trigger') {
    Mousetrap.trigger(keySetting.trigger)
  }

  if (action === 'buttonnexttab') {
    if (keySetting.button) {
      document.querySelector(keySetting.button).click()
    }
    message.action = 'nexttab'
  }

  chrome.runtime.sendMessage(message)
}

/**
 * Given a key shortcut config item, ask if the current site is allowed, and if so,
 * activate the shortcut.
 *
 * @param keySetting
 */
Shortkeys.activateKey = (keySetting) => {
  let action = function () {
    Shortkeys.doAction(keySetting)
    return false
  }
  Mousetrap.bind(keySetting.key.toLowerCase(), action)
}

/**
 * Overrides the default stopCallback from Mousetrap so that we can customize
 * a few things, such as not using the "whitelist inputs with the mousetrap class"
 * functionality and wire up the "activate in form inputs" checkbox.
 *
 * @param e
 * @param element
 * @param combo
 */
Mousetrap.prototype.stopCallback = function (e, element, combo) {
  let keySetting = Shortkeys.fetchConfig(combo)

  if (element.classList.contains('mousetrap')) {
    // We're not using the 'mousetrap' class functionality, which allows
    // you to whitelist elements, so if we come across elements with that class
    // then we can assume that they are provided by the site itself, not by
    // us, so we don't activate Shortkeys in that case, to prevent conflicts.
    // This fixes the chat box in Twitch.tv for example.
    return true
  } else if (!keySetting.activeInInputs) {
    // If the user has not checked "Also allow in form inputs" for this shortcut,
    // then we cut out of the user is in a form input.
    return element.tagName === 'INPUT' ||
      element.tagName === 'SELECT' ||
      element.tagName === 'TEXTAREA' ||
      element.isContentEditable
  } else {
    // The user HAS checked "Also allow in form inputs" for this shortcut so we
    // have no reason to stop it from triggering.
    return false
  }
}

/**
 * Fetches the Shortkeys configuration object and wires up each configured shortcut.
 */
chrome.runtime.sendMessage({action: 'getKeys', url: document.URL}, function (response) {
  if (response) {
    Shortkeys.keys = response
    if (Shortkeys.keys.length > 0) {
      Shortkeys.keys.forEach((key) => {
        Shortkeys.activateKey(key)
      })
    }
  }
})
