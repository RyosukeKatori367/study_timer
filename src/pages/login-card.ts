// ログインボーナスのカード（イベントタブのいちばん上）。

import { LOGIN_BONUS, OPEN_BONUS, STREAK_BONUS, STREAK_DAYS, claimLogin, fmtGumi, loginStatus } from '../gumi';
import { toast } from '../ui/toast';

export function loginCardHtml(): string {
  const st = loginStatus();
  const days = Array.from({ length: STREAK_DAYS }, (_, i) => {
    const d = i + 1;
    const cls = d < st.day || (d === st.day && st.claimed) ? 'got' : d === st.day ? 'today' : '';
    const amt = LOGIN_BONUS + (d === STREAK_DAYS ? STREAK_BONUS : 0);
    return `<span class="ld ${cls}${d === STREAK_DAYS ? ' big' : ''}"><small>${d}日目</small><b>${amt}</b></span>`;
  }).join('');
  return `
    <section class="login-card${st.claimed ? ' done' : ''}">
      <div class="login-head"><b>ログインボーナス</b><span>${
        st.streak > 1 ? `${st.claimed ? '' : '今日で'}${st.streak}日 連続` : '毎日もらえる'
      }</span></div>
      <div class="login-days">${days}</div>
      ${
        st.claimed
          ? '<div class="login-note">今日の分は受け取りました。また明日</div>'
          : `<button type="button" class="btn primary" data-bonus>+${fmtGumi(st.amount + (st.open ? OPEN_BONUS : 0))} 受け取る</button>
             ${st.open ? `<div class="login-note">開店記念の ${OPEN_BONUS}グミも いっしょに</div>` : ''}`
      }
    </section>`;
}

export function bindLoginCard(root: HTMLElement): void {
  root.querySelector<HTMLElement>('[data-bonus]')?.addEventListener('click', () => {
    const got = claimLogin();
    if (got) toast(`+${fmtGumi(got)}グミ`);
  });
}
