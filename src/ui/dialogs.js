let activeDialog = null;

function closeActiveDialog() {
  if (!activeDialog) return;
  const { overlay, onCancel } = activeDialog;
  activeDialog = null;
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  if (typeof onCancel === 'function') onCancel();
}

function createDialogBase({ title, message, variant = 'info' }) {
  closeActiveDialog();
  const overlay = document.createElement('div');
  overlay.className = 'app-dialog-overlay';
  overlay.setAttribute('role', 'presentation');

  const panel = document.createElement('section');
  panel.className = `app-dialog app-dialog--${variant}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  if (title) {
    const heading = document.createElement('h3');
    heading.className = 'app-dialog-title';
    heading.textContent = title;
    panel.appendChild(heading);
  }

  const body = document.createElement('p');
  body.className = 'app-dialog-message';
  body.textContent = message || '';
  panel.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'app-dialog-actions';
  panel.appendChild(actions);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  return { overlay, panel, actions };
}

function bindEscape(overlay, handler) {
  const onKeyDown = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      handler();
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  const cleanup = () => document.removeEventListener('keydown', onKeyDown, true);
  activeDialog = { overlay, onCancel: cleanup };
  return cleanup;
}

export function showAlertDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const { title = 'Notice', okText = 'OK', variant = 'info' } = opts;
    const { overlay, actions } = createDialogBase({ title, message, variant });

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'app-dialog-btn app-dialog-btn--primary';
    okBtn.textContent = okText;
    actions.appendChild(okBtn);

    const close = () => {
      cleanup();
      closeActiveDialog();
      resolve();
    };
    const cleanup = bindEscape(overlay, close);
    okBtn.addEventListener('click', close);
    okBtn.focus();
  });
}

export function showConfirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const {
      title = 'Please confirm',
      okText = 'Confirm',
      cancelText = 'Cancel',
      variant = 'warning',
    } = opts;
    const { overlay, actions } = createDialogBase({ title, message, variant });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'app-dialog-btn app-dialog-btn--secondary';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'app-dialog-btn app-dialog-btn--primary';
    okBtn.textContent = okText;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    const cancel = () => {
      cleanup();
      closeActiveDialog();
      resolve(false);
    };
    const confirm = () => {
      cleanup();
      closeActiveDialog();
      resolve(true);
    };
    const cleanup = bindEscape(overlay, cancel);

    cancelBtn.addEventListener('click', cancel);
    okBtn.addEventListener('click', confirm);
    okBtn.focus();
  });
}

export function showPromptDialog(message, defaultValue = '', opts = {}) {
  return new Promise((resolve) => {
    const {
      title = 'Enter value',
      okText = 'Save',
      cancelText = 'Cancel',
      placeholder = '',
      variant = 'info',
    } = opts;
    const { overlay, panel, actions } = createDialogBase({ title, message, variant });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'app-dialog-input';
    input.value = defaultValue || '';
    if (placeholder) input.placeholder = placeholder;
    panel.insertBefore(input, actions);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'app-dialog-btn app-dialog-btn--secondary';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'app-dialog-btn app-dialog-btn--primary';
    okBtn.textContent = okText;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    const cancel = () => {
      cleanup();
      closeActiveDialog();
      resolve(null);
    };
    const confirm = () => {
      cleanup();
      const value = input.value;
      closeActiveDialog();
      resolve(value);
    };
    const cleanup = bindEscape(overlay, cancel);

    cancelBtn.addEventListener('click', cancel);
    okBtn.addEventListener('click', confirm);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        confirm();
      }
    });
    input.focus();
    input.select();
  });
}
