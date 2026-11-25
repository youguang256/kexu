/* ============================================================================
 * CoursePilot 适配器运行时 · JS 侧协议（桥）
 * ----------------------------------------------------------------------------
 * 移植自拾光课表 shared/.../web/WebBridgeProtocol.kt 的 JS_BRIDGE_INIT，
 * 保持 action 名称与 payload 形状一致，因此「照着拾光写的适配脚本」可以原样丢进来跑。
 *
 * 通道：
 *   JS  →  Native : window._shiguangNativeBridge.postMessage(jsonString)
 *   Native → JS   : window._shiguangNativeCallback(callbackId, ok, result)
 *
 * 9 个标准 action（拾光同款）：
 *   showToast / showAlert / showPrompt / showSingleSelection
 *   saveImportedCourses / saveCourseConfig / savePresetTimeSlots / saveComboSchedule
 *   notifyTaskCompletion
 * 运行时自加的 2 个（拾光没有，仅本 App 用于排障）：
 *   dumpPage / log
 * ==========================================================================*/
(function () {
  'use strict';
  if (window._shiguangBridgeInjected) return;
  window._shiguangBridgeInjected = true;

  var callbacks = {};
  var counter = 0;

  function postRawMessage(msg) {
    if (window._shiguangNativeBridge && typeof window._shiguangNativeBridge.postMessage === 'function') {
      window._shiguangNativeBridge.postMessage(msg);
      return true;
    }
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.shiguangBridge) {
      window.webkit.messageHandlers.shiguangBridge.postMessage(msg);
      return true;
    }
    console.warn('[CPBridge] Native 桥不可用：' + msg);
    return false;
  }

  function post(action, payload, callbackId) {
    return postRawMessage(JSON.stringify({
      action: action,
      callbackId: callbackId || null,
      payload: payload ? JSON.stringify(payload) : null
    }));
  }

  function call(action, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'cb_' + (++counter) + '_' + Date.now();
      callbacks[id] = { resolve: resolve, reject: reject };
      // 5 秒没有回应就 reject，避免脚本永远挂住（拾光在这点上是会一直 pending 的）
      var timer = setTimeout(function () {
        if (!callbacks[id]) return;
        delete callbacks[id];
        reject(new Error('原生无响应：' + action));
      }, 15000);
      var wrapped = {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); }
      };
      callbacks[id] = wrapped;
      if (!post(action, payload, id)) {
        clearTimeout(timer);
        delete callbacks[id];
        reject(new Error('桥不通：' + action));
      }
    });
  }

  window._shiguangNativeCallback = function (callbackId, ok, result) {
    var cb = callbacks[callbackId];
    if (!cb) return;
    delete callbacks[callbackId];
    try {
      if (ok) cb.resolve(result); else cb.reject(result);
    } catch (e) {
      console.error('[CPBridge] 回调处理异常', e);
    }
  };

  /* ── 异步（有回值）── */
  var promiseApi = {
    showAlert: function (titleText, contentText, confirmText) {
      return call('showAlert', {
        titleText: titleText || '',
        contentText: contentText || '',
        confirmText: confirmText || null
      });
    },
    showPrompt: function (titleText, tipText, defaultText, validatorJsFunction) {
      return call('showPrompt', {
        titleText: titleText || '',
        tipText: tipText || '',
        defaultText: defaultText || '',
        validatorJsFunction: validatorJsFunction || ''
      });
    },
    showSingleSelection: function (titleText, items, defaultSelectedIndex) {
      var itemsJson = (typeof items === 'string') ? items : JSON.stringify(items || []);
      return call('showSingleSelection', {
        titleText: titleText || '',
        itemsJsonString: itemsJson,
        defaultSelectedIndex: (defaultSelectedIndex === undefined || defaultSelectedIndex === null) ? -1 : defaultSelectedIndex
      });
    },
    saveImportedCourses: function (coursesJsonString) {
      return call('saveImportedCourses', { coursesJsonString: coursesJsonString });
    },
    saveCourseConfig: function (configJsonString) {
      return call('saveCourseConfig', { configJsonString: configJsonString });
    },
    savePresetTimeSlots: function (timeSlotsJsonString) {
      return call('savePresetTimeSlots', { timeSlotsJsonString: timeSlotsJsonString });
    },
    saveComboSchedule: function (comboScheduleJsonString) {
      var j = (typeof comboScheduleJsonString === 'string') ? comboScheduleJsonString : JSON.stringify(comboScheduleJsonString || {});
      return call('saveComboSchedule', { comboScheduleJsonString: j });
    },
    /* 本 App 专属：把当前页面 HTML 落盘，用于按真实结构写解析（不再靠猜） */
    dumpPage: function (name) {
      var html = '';
      try { html = document.documentElement.outerHTML; } catch (e) { html = ''; }
      return call('dumpPage', { name: String(name || 'page'), html: html });
    }
  };

  /* ── 单向（无回值）── */
  var syncApi = {
    showToast: function (message) {
      post('showToast', { message: message });
    },
    notifyTaskCompletion: function () {
      post('notifyTaskCompletion', null);
    },
    log: function (message) {
      post('log', { message: String(message) });
    }
  };

  window.shiguangBridgePromise = promiseApi;
  window.shiguangBridge = syncApi;

  /* 旧版别名（拾光脚本里也有用 AndroidBridge 的） */
  window.AndroidBridgePromise = promiseApi;
  window.AndroidBridge = syncApi;
})();
