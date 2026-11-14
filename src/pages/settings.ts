import { clearSessions, exportBackup, getSessions, importBackup, saveSettings, settings } from '../store';
import { $, html } from '../ui/dom';
import { toast } from '../ui/toast';

type Toggle = 'overrun' | 'sound' | 'keepAwake';

/** 記録を JSON ファイルとして渡す。iPhone では共有シート、それ以外はダウンロード。 */
async function exportFile(): Promise<void> {
  const name = `gumiben-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([exportBackup()], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      // 共有をキャンセルしただけなら何もしない
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = html<HTMLAnchorElement>(`<a download="${name}"></a>`);
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initSettingsPage(view: HTMLElement, onDataChange: () => void): void {
  view.append(
    html(`<h1>設定</h1>`),
    html(`
      <div class="list">
        <div class="section-label">タイマー</div>
        <button type="button" class="list-row" role="switch" data-toggle="overrun">
          <span>0を過ぎても数える（超過）</span><span class="switch" aria-hidden="true"></span>
        </button>
      </div>`),
    html(`
      <div class="list">
        <div class="section-label">音</div>
        <button type="button" class="list-row" role="switch" data-toggle="sound">
          <span>終了時に音を鳴らす</span><span class="switch" aria-hidden="true"></span>
        </button>
      </div>`),
    html(`
      <div class="list">
        <div class="section-label">画面</div>
        <button type="button" class="list-row" role="switch" data-toggle="keepAwake">
          <span>計測中は画面をつけたままにする</span><span class="switch" aria-hidden="true"></span>
        </button>
      </div>`),
    html(`
      <div class="list">
        <div class="section-label">データ</div>
        <button type="button" class="list-row" data-action="export"><span>記録を書き出す</span><span class="chevron" aria-hidden="true">›</span></button>
        <button type="button" class="list-row" data-action="import"><span>記録を読み込む</span><span class="chevron" aria-hidden="true">›</span></button>
        <button type="button" class="list-row danger" data-action="clear"><span>記録をすべて消す</span></button>
        <input type="file" accept="application/json,.json" hidden>
      </div>`),
  );

  const toggles = view.querySelectorAll<HTMLElement>('[data-toggle]');
  const render = () => {
    toggles.forEach((b) => b.setAttribute('aria-checked', String(settings[b.dataset.toggle as Toggle])));
  };
  toggles.forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.toggle as Toggle;
      saveSettings({ [key]: !settings[key] });
      render();
    };
  });

  const fileInput = $<HTMLInputElement>('input[type="file"]', view);
  $('[data-action="export"]', view).onclick = () => {
    if (getSessions().length === 0) return toast('まだ記録がありません');
    void exportFile();
  };
  $('[data-action="import"]', view).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const added = importBackup(await file.text());
      toast(`${added}件の記録を読み込みました`);
      onDataChange();
    } catch (e) {
      toast(e instanceof Error && e.message.includes('グミ勉') ? e.message : 'ファイルを読み込めませんでした');
    }
  };
  $('[data-action="clear"]', view).onclick = () => {
    if (!confirm('これまでの記録をすべて消します。元に戻せません。よろしいですか？')) return;
    clearSessions();
    saveSettings({ nextLap: null });
    toast('記録を消しました');
    onDataChange();
  };

  render();
}
