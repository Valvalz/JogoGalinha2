const rankingList = document.getElementById('rankingList');

function getLocalRankings() {
  try {
    return JSON.parse(localStorage.getItem('farmEscapeRankings') || '[]');
  } catch (e) {
    return [];
  }
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function renderRankings() {
  if (!rankingList) return;
  let rankings = [];
  try {
    const response = await fetch('/api/scores');
    if (!response.ok) throw new Error('ranking indisponível');
    rankings = await response.json();
  } catch (e) {
    rankings = getLocalRankings();
  }

  if (!rankings.length) {
    rankingList.innerHTML = '<div class="rankingItem"><span>🌾 Nenhum campeão ainda. Jogue e volte para ver seu nome aqui! 🌾</span></div>';
    return;
  }

  rankingList.innerHTML = rankings.map((item, index) => {
    const dateLabel = item.date ? formatDate(item.date) : 'sem data';
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
    return `
      <div class="rankingItem">
        <span class="rankPosition">${medal}</span>
        <div class="rankDetails">
          <span class="rankName">${item.name}</span>
          <span class="rankDate">${dateLabel} · Fase ${item.phase || 1}</span>
        </div>
        <span class="rankScore">${item.score} pts</span>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', renderRankings);
