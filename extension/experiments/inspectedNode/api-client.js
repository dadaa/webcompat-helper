"use strict";

// We can not call any experimental APIs in devtools page context.
// https://searchfox.org/mozilla-central/source/toolkit/components/extensions/docs/basics.rst#155-156
// Thus, introduce api-server / api-client that provides pseudo api to make experimental
// api accessible even in devtools page context.
//
// This script should run on devtools page context.

(async function install() {
  if (browser.experiments && browser.experiments.inspectedNode) {
    return;
  }

  if (!browser.experiments) {
    browser.experiments = {};
  }

  const port = browser.runtime.connect();

  browser.experiments.inspectedNode = {
    onChange: {
      addListener(listener) {
        if (!this._listeners) {
          this._listeners = [listener];

          const method = "onChange";
          port.onMessage.addListener(response => {
            if (method === response.method) {
              for (const _listener of this._listeners) {
                _listener();
              }
            }
          });

          port.postMessage({ method });
        } else {
          this._listeners.push(listener);
        }
      }
    },

    async getStyle() {
      return new Promise(resolve => {
        const method = "getStyle"
        const timestamp = Date.now();

        const listener = response => {
          if (method === response.method && timestamp === response.timestamp) {
            port.onMessage.removeListener(listener);
            resolve(response.result);
          }
        };

        port.onMessage.addListener(listener);
        port.postMessage({ method, timestamp });
      });
    }
  };
})();