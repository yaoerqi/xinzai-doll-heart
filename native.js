/* Native capabilities are available only inside the signed Android application. */
(() => {
  const available = typeof window.XinZaiAndroid?.request === 'function';
  const pending = new Map();
  let sequence = 0;
  window.XinZaiNative = {
    available,
    request(action, params = {}) {
      if (!available) return Promise.reject(new Error('此功能需要在安卓 App 中使用'));
      return new Promise((resolve, reject) => {
        const id = `native-${Date.now()}-${++sequence}`;
        // System permission and document dialogs wait for the user, not a network timeout.
        const interactive = ['export', 'trackStart', 'bleScan', 'bleConnect', 'notificationPermission'].includes(action);
        const timer = interactive ? null : setTimeout(() => { pending.delete(id); reject(new Error('操作超时，可以重新尝试')); }, 60000);
        pending.set(id, { resolve, reject, timer });
        try { window.XinZaiAndroid.request(JSON.stringify({ id, action, params })); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
    receive(response) {
      const task = pending.get(response.id); if (!task) return;
      clearTimeout(task.timer); pending.delete(response.id);
      response.ok ? task.resolve(response.data) : task.reject(new Error(response.error || '操作未完成'));
    },
    event(event) { window.dispatchEvent(new CustomEvent('xinzai-native', { detail: event })); },
    async exportBlob(blob, name) {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
      return this.request('export', { name, mime: blob.type.split(';')[0], base64: data });
    }
  };
  window.XinZaiStorage = {
    getItem(key) { return available ? window.XinZaiAndroid.loadState() || null : localStorage.getItem(key); },
    setItem(key, value) { if (available) { if (!window.XinZaiAndroid.saveState(value)) throw new Error('手机储存空间不足，回忆未保存'); } else localStorage.setItem(key, value); }
  };
  if (available) document.documentElement.classList.add('native-android');
})();
