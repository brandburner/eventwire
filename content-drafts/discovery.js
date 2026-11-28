'use strict';

(function (root) {
  const $ = id => document.getElementById(id);

  const TOPIC_LABELS = {
    direct_connection: 'Direct connection',
    connected_guidance: 'Connected guidance',
    incidental: 'Incidental',
    unrelated: 'Unrelated',
    unsure: 'Unsure'
  };

  const IMPACT_LABELS = {
    needs_impact_review: 'Needs impact review',
    possible_edit: 'Possible edit',
    no_change_evidenced: 'No change evidenced',
    unsure: 'Unsure'
  };

  const READINESS_LABELS = {
    ready: 'Ready',
    provisional: 'Provisional',
    blocked: 'Blocked'
  };

  const STAGE_LABELS = {
    discovered: 'Discovered (search retrieval only)',
    machine_screened: 'AI relevance screened'
  };

  const SCREEN_LABELS = {
    direct_connection: 'Direct guidance',
    connected_task: 'Connected task',
    substantive_connection: 'Likely related',
    related_background: 'Background',
    insufficient_evidence: 'Uncertain',
    incidental_or_unrelated: 'Unlikely related'
  };

  const MACHINE_VALUE_LABELS = {
    unassessed: 'Unassessed',
    unknown: 'Unknown'
  };

  const ASSESSMENT_FORMAT = 'mwp-discovery-assessments';
  const ASSESSMENT_SCHEMA_VERSION = 1;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  function capturedMarkup(text, structure) {
    // Text is always escaped. Structure contains only source-aligned spans;
    // captured attributes, links, scripts and styles are never rendered.
    if (!Array.isArray(structure) || !structure.length) return esc(text);
    const chars = Array.from(text);
    const tags = new Set(['p','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote']);
    const segment = (a,b) => {
      const value = chars.slice(a,b).join('');
      return value.trim() ? '<span class="source-text">' + esc(value) + '</span>' : '';
    };
    function render(nodes, start, end, depth) {
      if (depth > 80 || !Array.isArray(nodes)) throw Error('Invalid source structure');
      let cursor = start, html = '';
      for (const n of nodes) {
        if (!tags.has(n.tag) || !Number.isInteger(n.start) || !Number.isInteger(n.end) ||
            n.start < cursor || n.end > end || n.end <= n.start) throw Error('Invalid source span');
        html += segment(cursor,n.start);
        let attrs = '';
        if (n.tag === 'li' && Number.isInteger(n.value) && Math.abs(n.value) <= 1000000) attrs += ' value="' + n.value + '"';
        if (n.tag === 'ol' && n.reversed === true) attrs += ' reversed';
        if (n.tag === 'ol' && ['1','a','A','i','I'].includes(n.list_type)) attrs += ' type="' + n.list_type + '"';
        html += '<' + n.tag + attrs + '>' + render(n.children,n.start,n.end,depth+1) + '</' + n.tag + '>';
        cursor = n.end;
      }
      return html + segment(cursor,end);
    }
    try { return '<div class="structured-source">' + render(structure,0,chars.length,0) + '</div>'; }
    catch { return esc(text); }
  }

  function safeHref(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('/')) return 'https://www.gov.uk' + trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
  }

  function normalizeUrl(url) {
    const href = safeHref(url);
    if (!href) return '';
    try {
      const parsed = new URL(href);
      return (parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/+$/, '')).toLowerCase();
    } catch {
      return href.replace(/\/+$/, '').toLowerCase();
    }
  }

  function humanizeToken(value) {
    if (!value) return 'Not recorded';
    return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }

  function formatNumber(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return 'Not reported';
    return n.toLocaleString('en-GB');
  }

  function formatDateTime(value) {
    if (!value) return 'Not recorded';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDateShort(value) {
    if (!value) return 'Not recorded';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatOrganisations(orgs) {
    if (!Array.isArray(orgs) || orgs.length === 0) return [];
    return orgs
      .map(o => {
        if (typeof o === 'string') return o.trim();
        if (o && typeof o === 'object') return String(o.title || o.slug || '').trim();
        return '';
      })
      .filter(Boolean);
  }

  function candidateTitle(candidate) {
    const title = String(candidate.title || candidate.url || candidate.id || 'Untitled page');
    return candidate.family_title && /^(overview|introduction|contents)$/i.test(title.trim())
      ? candidate.family_title + ' — ' + title : title;
  }

  function candidateTextHash(candidate) {
    if (candidate && /^[a-f0-9]{64}$/.test(candidate.text_hash || '')) return candidate.text_hash;
    if (candidate && /^[a-f0-9]{64}$/.test(candidate.text_sha256 || '')) {
      return candidate.text_sha256.trim();
    }
    const passages = Array.isArray(candidate && candidate.passages) ? candidate.passages : [];
    const hashes = passages
      .map(p => (p && typeof p.text_sha256 === 'string' ? p.text_sha256.trim() : ''))
      .filter(h => /^[a-f0-9]{64}$/.test(h));
    if (hashes.length && new Set(hashes).size === 1) return hashes[0];
    return '';
  }

  function buildAssessmentKey(runId, candidate) {
    return [
      String(runId || 'unknown-run'),
      String(candidate.measure_id || ''),
      String(candidate.surface_id || candidate.id || ''),
      candidateTextHash(candidate)
    ].join('::');
  }

  function storageKeyForRun(runId) {
    return 'mwp-discovery-assessments-v1::' + String(runId || 'unknown-run');
  }

  function normalizeCoverage(raw) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const consumed = new Set();
    const pick = keys => {
      for (const k of keys) {
        if (Object.hasOwn(c, k) && c[k] !== undefined && c[k] !== null) {
          consumed.add(k);
          return c[k];
        }
      }
      return null;
    };

    const textSurfaces = pick(['indexed_text_surfaces', 'text_surfaces', 'searchable_text_surfaces', 'captured_text_surfaces']);
    const rawByApp = pick(['sources', 'by_app', 'publishing_apps', 'apps']);
    const unclassifiedBinaries = pick(['unindexed_binary_surfaces', 'binary_surfaces', 'unclassified_binary_surfaces', 'whitehall_binary_surfaces']);
    const otherUnresolved = pick(['other_unresolved_surfaces', 'unresolved_surfaces']);
    const rawLimitations = pick(['limitations', 'notes', 'extraction_gaps']);

    let byApp = [];
    if (Array.isArray(rawByApp)) {
      byApp = rawByApp
        .map(item => {
          if (!item || typeof item !== 'object') return null;
          const app = item.app || item.publishing_app || item.name || item.id;
          const count = item.indexed_text_surfaces ?? item.count ?? item.surfaces ?? item.total;
          return app ? { app: String(app), count } : null;
        })
        .filter(Boolean);
    } else if (rawByApp && typeof rawByApp === 'object') {
      byApp = Object.entries(rawByApp).map(([app, count]) => ({ app, count }));
    }

    let limitations = [];
    if (Array.isArray(rawLimitations)) {
      limitations = rawLimitations.map(x => String(x)).filter(Boolean);
    } else if (typeof rawLimitations === 'string' && rawLimitations.trim()) {
      limitations = [rawLimitations.trim()];
    }

    // Do not turn nested provenance or duplicate aliases into an unreadable table.
    const extraLabels = {unique_page_urls: 'Distinct indexed page URLs', not_indexed_surfaces: 'All surfaces outside text search'};
    const extra = Object.entries(extraLabels).filter(([k]) => typeof c[k] === 'number')
      .map(([k, label]) => ({key: label, value: c[k]}));

    return { textSurfaces, byApp, unclassifiedBinaries, otherUnresolved, limitations, extra };
  }

  function readinessTagClass(readiness) {
    if (readiness === 'ready') return 'tag tag-ready';
    if (readiness === 'provisional') return 'tag tag-provisional';
    if (readiness === 'blocked') return 'tag tag-blocked';
    return 'tag tag-neutral';
  }

  function readinessLabel(readiness) {
    return READINESS_LABELS[readiness] || humanizeToken(readiness || 'unknown');
  }

  function initDiscovery() {
    const pilotPages = Array.isArray(root.PILOT) ? root.PILOT : [];
    const catalogueMeasures = Array.isArray(root.MWP_MEASURES) ? root.MWP_MEASURES : [];
    const discovery = root.MWP_DISCOVERY;

    const pilotById = new Map(pilotPages.map(p => [p.id, p]));
    const pilotByUrl = new Map();
    const pilotCountByMeasure = new Map();
    for (const p of pilotPages) {
      const norm = normalizeUrl(p.url);
      if (norm && !pilotByUrl.has(norm)) pilotByUrl.set(norm, p);
      for (const mid of p.measureIds || []) {
        pilotCountByMeasure.set(mid, (pilotCountByMeasure.get(mid) || 0) + 1);
      }
    }

    const state = {
      discovery: null,
      measures: [],
      measureMap: new Map(),
      candidates: [],
      candidatesByMeasure: new Map(),
      candidatesBySurface: new Map(),
      selectedMeasureId: '', // '' means All measures
      selectedCandidateId: '',
      measureQuery: '',
      readinessFilter: '',
      candidateQuery: '',
      appFilter: '',
      docTypeFilter: '',
      assessmentFilter: '',
      draftFilter: '',
      screenFilter: 'all',
      candidateSort: 'rank',
      assessments: {},
      storageWarning: '',
      formDirty: false,
      formBuffers: new Map(),
      activeFormCandidateId: '',
      queuePage: 0,
      queuePageSize: 100,
      textRequest: 0,
      textCandidateId: '',
      unsyncedAssessments: false,
      activeUtilityPanel: null // 'coverage' | 'assessments' | null
    };

    function resolveDraftLink(candidate) {
      if (candidate.draft_page_id && pilotById.has(candidate.draft_page_id)) {
        const page = pilotById.get(candidate.draft_page_id);
        if (!(page.measureIds || []).includes(candidate.measure_id)) return null;
        const exact = normalizeUrl(page.url) === normalizeUrl(candidate.url);
        const family = normalizeUrl(page.url) === normalizeUrl(candidate.family);
        if (exact) return {page, matchType: 'exact_page'};
        if (family && candidate.draft_relationship === 'same_publication_family') return {page, matchType: 'same_publication_family'};
        return null;
      }
      const norm = normalizeUrl(candidate.url);
      const page = norm && pilotByUrl.get(norm);
      if (page && (page.measureIds || []).includes(candidate.measure_id)) {
        return { page, matchType: 'exact_page' };
      }
      return null;
    }

    function loadAssessments(runId) {
      state.assessments = {};
      state.storageWarning = '';
      try {
        const raw = localStorage.getItem(storageKeyForRun(runId));
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const byKey = new Map(state.candidates.map(c => [buildAssessmentKey(runId, c), c]));
          let skipped = 0;
          for (const [key, record] of Object.entries(parsed)) {
            const c = byKey.get(key);
            if (!c || !validAssessmentRecord(record, c) || record.key !== key) { skipped++; continue; }
            state.assessments[key] = record;
          }
          if (skipped) state.storageWarning = skipped + ' invalid or stale stored assessment(s) were ignored. The original browser data has not been overwritten.';
        }
      } catch (err) {
        state.storageWarning = 'Browser storage could not be read. Assessments remain in memory for this session only.';
      }
    }

    function persistAssessments() {
      try {
        localStorage.setItem(storageKeyForRun(state.discovery.run_id), JSON.stringify(state.assessments));
        state.storageWarning = '';
        state.unsyncedAssessments = false;
        return { ok: true };
      } catch (err) {
        const reason = err && err.name ? err.name : 'storage error';
        state.storageWarning = 'Browser storage is unavailable (' + reason + '). Download your assessments as JSON before leaving.';
        state.unsyncedAssessments = true;
        return { ok: false, error: state.storageWarning };
      }
    }

    function getAssessmentFor(candidate) {
      if (!state.discovery || !candidate) return null;
      const key = buildAssessmentKey(state.discovery.run_id, candidate);
      return state.assessments[key] || null;
    }

    function validAssessmentRecord(rec, candidate) {
      if (!rec || typeof rec !== 'object' || !rec.binding || !rec.assessment) return false;
      const b = rec.binding, a = rec.assessment, hash = candidateTextHash(candidate);
      return Boolean(hash && b.run_id === state.discovery.run_id && b.measure_id === candidate.measure_id &&
        b.surface_id === (candidate.surface_id || candidate.id) && b.text_hash === hash &&
        typeof a.topic_relevance === 'string' && (!a.topic_relevance || Object.hasOwn(TOPIC_LABELS, a.topic_relevance)) &&
        typeof a.change_impact === 'string' && (!a.change_impact || Object.hasOwn(IMPACT_LABELS, a.change_impact)) &&
        typeof a.notes === 'string' && (a.topic_relevance || a.change_impact || a.notes.trim()) &&
        typeof a.updated_at === 'string' && Number.isFinite(Date.parse(a.updated_at)));
    }

    function bufferCurrentForm() {
      if (!state.formDirty) return;
      const c = state.candidates.find(candidate => candidate.id === state.activeFormCandidateId);
      if (!c) return;
      const key = buildAssessmentKey(state.discovery.run_id, c);
      const values = {topic_relevance: $('assessTopic').value, change_impact: $('assessImpact').value, notes: $('assessNotes').value};
      const saved = getAssessmentFor(c);
      const prior = saved ? saved.assessment : {topic_relevance:'', change_impact:'', notes:''};
      const dirty = Object.keys(values).some(k => values[k] !== prior[k]);
      if (dirty) state.formBuffers.set(key, values);
      else state.formBuffers.delete(key);
      state.formDirty = dirty;
    }

    function countSavedAssessments(measureId) {
      const entries = Object.values(state.assessments);
      if (!measureId) return entries.length;
      return entries.filter(r => r && r.binding && r.binding.measure_id === measureId).length;
    }

    function validateAndRestorePayload(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: 'The selected file is not a valid JSON object. Export assessments from this workspace and try again.' };
      }
      if (payload.format !== ASSESSMENT_FORMAT) {
        return { ok: false, error: 'Unsupported file format. Expected "' + ASSESSMENT_FORMAT + '".' };
      }
      if (payload.schema_version !== ASSESSMENT_SCHEMA_VERSION) {
        return { ok: false, error: 'Unsupported assessment schema version (' + String(payload.schema_version) + '). Expected schema version ' + ASSESSMENT_SCHEMA_VERSION + '.' };
      }
      if (payload.run_id !== state.discovery.run_id) {
        return {
          ok: false,
          error: 'Run mismatch: this file belongs to discovery run "' + String(payload.run_id || 'unknown') + '", but the loaded export is run "' + String(state.discovery.run_id) + '". Assessments were not changed.'
        };
      }
      if (!Array.isArray(payload.records)) {
        return { ok: false, error: 'Assessment file is missing a records array.' };
      }

      const byExactKey = new Map();
      const byMeasureSurface = new Map();
      for (const c of state.candidates) {
        byExactKey.set(buildAssessmentKey(state.discovery.run_id, c), c);
        const ms = String(c.measure_id || '') + '::' + String(c.surface_id || c.id || '');
        if (!byMeasureSurface.has(ms)) byMeasureSurface.set(ms, c);
      }

      let restored = 0;
      let skippedStaleHash = 0;
      let skippedMissing = 0;
      let skippedInvalid = 0;
      let skippedOlder = 0;
      const next = Object.assign({}, state.assessments);
      const incomingKeys = new Set();

      for (const rec of payload.records) {
        if (!rec || typeof rec !== 'object' || !rec.binding || !rec.assessment) {
          skippedInvalid++;
          continue;
        }
        const b = rec.binding;
        const a = rec.assessment;
        if (b.run_id !== state.discovery.run_id || !b.measure_id || !b.surface_id || !b.text_hash) {
          skippedInvalid++;
          continue;
        }
        const topic = a.topic_relevance || '';
        const impact = a.change_impact || '';
        const notes = typeof a.notes === 'string' ? a.notes : '';
        if (topic && !Object.hasOwn(TOPIC_LABELS, topic)) {
          skippedInvalid++;
          continue;
        }
        if (impact && !Object.hasOwn(IMPACT_LABELS, impact)) {
          skippedInvalid++;
          continue;
        }
        if (!topic && !impact && !notes.trim()) {
          skippedInvalid++;
          continue;
        }

        const key = [b.run_id, b.measure_id, b.surface_id, b.text_hash].join('::');
        if (incomingKeys.has(key)) return {ok:false, error:'This file contains duplicate assessments for one measure and page. Nothing was restored.'};
        incomingKeys.add(key);
        const matched = byExactKey.get(key);
        if (!matched) {
          const ms = String(b.measure_id) + '::' + String(b.surface_id);
          if (byMeasureSurface.has(ms)) skippedStaleHash++;
          else skippedMissing++;
          continue;
        }
        if (!candidateTextHash(matched) || typeof a.updated_at !== 'string' || !Number.isFinite(Date.parse(a.updated_at))) {
          skippedInvalid++;
          continue;
        }
        const existing = next[key];
        if (existing && Date.parse(existing.assessment.updated_at) >= Date.parse(a.updated_at) &&
            ['topic_relevance','change_impact','notes'].some(k => existing.assessment[k] !== (k === 'notes' ? notes : a[k] || ''))) {
          skippedOlder++;
          continue;
        }

        next[key] = {
          key,
          binding: {
            run_id: state.discovery.run_id,
            measure_id: matched.measure_id,
            surface_id: matched.surface_id || matched.id,
            text_hash: candidateTextHash(matched),
            candidate_id: matched.id
          },
          machine: {
            stage: matched.stage || 'discovered',
            topic_relevance: matched.topic_relevance || 'unassessed',
            change_impact: matched.change_impact || 'unassessed',
            currency: matched.currency || 'unknown'
          },
          assessment: {
            topic_relevance: topic,
            change_impact: impact,
            notes,
            updated_at: typeof a.updated_at === 'string' ? a.updated_at : new Date().toISOString()
          },
          origin: 'device_local_reviewer'
        };
        restored++;
      }

      if (restored === 0) {
        const parts = [];
        if (skippedStaleHash) parts.push(skippedStaleHash + ' skipped because captured text hash changed');
        if (skippedMissing) parts.push(skippedMissing + ' skipped because candidate is not in this run');
        if (skippedInvalid) parts.push(skippedInvalid + ' skipped due to invalid fields or enum values');
        if (skippedOlder) parts.push(skippedOlder + ' skipped because newer or conflicting same-time decisions are already saved');
        return {
          ok: false,
          error: 'No assessments could be restored. ' + (parts.length ? parts.join('; ') + '.' : 'The file contained 0 records.')
        };
      }

      state.assessments = next;
      const persisted = persistAssessments();
      const summaryParts = ['Restored ' + restored + ' assessment' + (restored === 1 ? '' : 's') + '.'];
      if (skippedStaleHash) summaryParts.push(skippedStaleHash + ' skipped (captured text hash changed).');
      if (skippedMissing) summaryParts.push(skippedMissing + ' skipped (not present in this run).');
      if (skippedInvalid) summaryParts.push(skippedInvalid + ' skipped (invalid record or enum).');
      if (skippedOlder) summaryParts.push(skippedOlder + ' skipped (newer or conflicting decisions already saved).');
      if (!persisted.ok) summaryParts.push(persisted.error);

      return { ok: persisted.ok, restored, skippedStaleHash, skippedMissing, skippedInvalid, skippedOlder,
        message: summaryParts.join(' '), error: persisted.ok ? '' : summaryParts.join(' ') };
    }

    function buildExportPayload() {
      return {
        format: ASSESSMENT_FORMAT,
        schema_version: ASSESSMENT_SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        run_id: state.discovery.run_id,
        discovery_schema_version: state.discovery.schema_version,
        origin_note: 'Device-local reviewer assessments. Not policy approval, automated classification or a publishing decision.',
        records: Object.values(state.assessments)
      };
    }

    // Missing or invalid discovery data handling
    function renderMissingDataState(reason) {
      $('activeWorkspace').hidden = true;
      $('missingState').hidden = false;

      // Still populate the measure rail truthfully from MWP_MEASURES catalogue if available
      $('readinessFilter').disabled = true;
      $('railCoverageLink').hidden = true;
      $('railAssessmentsLink').hidden = true;

      const filteredCatalogue = catalogueMeasures.filter(m => {
        const q = state.measureQuery.trim().toLowerCase();
        if (!q) return true;
        return (m.id + ' ' + m.label).toLowerCase().includes(q);
      });

      $('measureTotal').textContent = catalogueMeasures.length ? String(catalogueMeasures.length) : '0';
      $('measureCount').textContent = catalogueMeasures.length
        ? filteredCatalogue.length + ' of ' + catalogueMeasures.length + ' measures (catalogue only)'
        : 'No measure catalogue loaded';
      $('clearMeasureFilters').hidden = !state.measureQuery;
      $('measureEmpty').hidden = catalogueMeasures.length === 0 || filteredCatalogue.length > 0;

      $('measureList').innerHTML = filteredCatalogue.map(m => {
        const draftCount = pilotCountByMeasure.get(m.id) || 0;
        const href = 'drafts.html?measure=' + encodeURIComponent(m.id);
        return '<a class="measure-item" href="' + esc(href) + '" style="text-decoration:none">' +
          '<div class="measure-item-top"><span class="measure-code">' + esc(m.id) + '</span><span class="tag tag-neutral">Not loaded</span></div>' +
          '<span class="measure-label">' + esc(m.label) + '</span>' +
          '<span class="measure-sub">' + (draftCount ? draftCount + ' in Draft collection' : 'No draft entries yet · Open Draft collection') + '</span>' +
          '</a>';
      }).join('');

      const draftSummary = pilotPages.length
        ? 'The existing Draft collection contains ' + formatNumber(pilotPages.length) + ' real review entries and remains available now.'
        : 'You can switch to the Draft collection to review existing drafted pages.';

      $('missingBody').innerHTML =
        '<p>' + esc(reason) + '</p>' +
        '<div class="callout-box">' +
          '<p><strong>Expected local file:</strong> <span class="mono">discovery-data.js</span> exposing <span class="mono">window.MWP_DISCOVERY</span> (schema version 1) in this directory.</p>' +
          '<p>No sample or placeholder corpus results are fabricated here. Absence of a local discovery export never indicates an absence of affected GOV.UK guidance.</p>' +
          '<p>Workflow model once loaded: <strong>Find pages</strong> → <strong>Assess connection</strong> → <strong>Review impact</strong> → <strong>Draft where needed</strong>.</p>' +
        '</div>' +
        '<p>' + esc(draftSummary) + '</p>' +
        '<div class="callout-actions">' +
          '<a class="primary-link" href="drafts.html">Open Draft collection' + (pilotPages.length ? ' (' + formatNumber(pilotPages.length) + ' entries)' : '') + '</a>' +
        '</div>';
    }

    // Validate discovery payload
    if (!discovery) {
      $('measureSearch').addEventListener('input', e => {
        state.measureQuery = e.target.value;
        renderMissingDataState('No local discovery export was found in this folder.');
      });
      $('clearMeasureFilters').addEventListener('click', () => {
        state.measureQuery = '';
        $('measureSearch').value = '';
        renderMissingDataState('No local discovery export was found in this folder.');
      });
      $('toggleMeasures').addEventListener('click', () => {
        const open = $('measureRail').classList.toggle('rail-open');
        $('toggleMeasures').setAttribute('aria-expanded', String(open));
      });
      renderMissingDataState('No local discovery export was found in this folder.');
      return { state, renderMissingDataState };
    }

    if (
      typeof discovery !== 'object' ||
      discovery.schema_version !== 1 ||
      !Array.isArray(discovery.measures) ||
      !Array.isArray(discovery.candidates)
    ) {
      $('toggleMeasures').addEventListener('click', () => {
        const open = $('measureRail').classList.toggle('rail-open');
        $('toggleMeasures').setAttribute('aria-expanded', String(open));
      });
      renderMissingDataState(
        'The loaded discovery-data.js file does not match schema version 1 (expected schema_version: 1 with measures and candidates arrays).'
      );
      return { state, renderMissingDataState };
    }

    // Active discovery initialization
    state.discovery = discovery;
    state.measures = discovery.measures.slice();
    state.candidates = discovery.candidates.slice();
    for (const m of state.measures) {
      state.measureMap.set(m.id, m);
      state.candidatesByMeasure.set(m.id, []);
    }
    for (const c of state.candidates) {
      if (!state.candidatesByMeasure.has(c.measure_id)) {
        state.candidatesByMeasure.set(c.measure_id, []);
      }
      state.candidatesByMeasure.get(c.measure_id).push(c);
      const surfaceKey = c.surface_id || normalizeUrl(c.url) || c.id;
      if (!state.candidatesBySurface.has(surfaceKey)) {
        state.candidatesBySurface.set(surfaceKey, []);
      }
      state.candidatesBySurface.get(surfaceKey).push(c);
    }

    loadAssessments(discovery.run_id);

    // Initialize from URL query parameters
    const params = new URLSearchParams(root.location ? root.location.search : '');
    const initialMeasure = params.get('measure') || '';
    if (initialMeasure && state.measureMap.has(initialMeasure)) {
      state.selectedMeasureId = initialMeasure;
    } else if (!initialMeasure && state.measures.length > 0) {
      // Open on the first measure with candidates if available, otherwise first measure
      const firstWithHits = state.measures.find(m => (state.candidatesByMeasure.get(m.id) || []).length > 0);
      state.selectedMeasureId = firstWithHits ? firstWithHits.id : state.measures[0].id;
    }
    state.selectedCandidateId = params.get('candidate') || '';
    state.candidateQuery = params.get('q') || '';
    state.appFilter = params.get('app') || '';
    state.docTypeFilter = params.get('doctype') || '';
    state.assessmentFilter = params.get('assessment') || '';
    state.draftFilter = params.get('draft') || '';
    const hasScreen = Boolean(discovery.machine_screen);
    const requestedScreen = params.get('screen');
    const hasBoundaries = Boolean(discovery.machine_screen?.criteria?.direct_connection) || state.candidates.some(c => ['direct_connection','connected_task'].includes(c.machine_screen?.classification));
    const needsEvidence = c => c.machine_screen?.evidence_status === 'not_selected';
    const changedCandidate = c => ['promoted','excluded'].includes(c.machine_screen?.movement);
    const reviewCandidate = c => ['direct_connection','connected_task','substantive_connection'].includes(c.machine_screen?.classification);
    state.screenFilter = hasScreen && !params.has('candidate') ? (hasBoundaries ? 'review_candidates' : 'substantive_connection') : 'all';
    if (hasScreen && (requestedScreen === 'all' || requestedScreen === 'review_candidates' || requestedScreen === 'changed' || requestedScreen === 'evidence_check' || Object.hasOwn(SCREEN_LABELS, requestedScreen || ''))) {
      state.screenFilter = requestedScreen;
    }
    if (hasBoundaries && state.screenFilter === 'substantive_connection') state.screenFilter = 'review_candidates';
    $('screenFilterGroup').hidden = !hasScreen;
    $('screenFilter').value = state.screenFilter;
    const initialSort = params.get('sort') || 'rank';
    if (['rank', 'score', 'title', 'captured'].includes(initialSort)) {
      state.candidateSort = initialSort;
    }

    $('candidateSearch').value = state.candidateQuery;
    if (discovery.lazy_details) $('candidateSearch').placeholder = 'Search titles, organisations or topics';
    $('assessmentFilter').value = state.assessmentFilter;
    $('draftFilter').value = state.draftFilter;
    $('candidateSort').value = state.candidateSort;
    $('missingState').hidden = true;
    $('activeWorkspace').hidden = false;

    function syncUrl() {
      if (!root.location || !root.history || !root.history.replaceState) return;
      try {
        const url = new URL(root.location.href);
        const pairs = [
          ['measure', state.selectedMeasureId],
          ['candidate', state.selectedCandidateId],
          ['q', state.candidateQuery],
          ['app', state.appFilter],
          ['doctype', state.docTypeFilter],
          ['assessment', state.assessmentFilter],
          ['draft', state.draftFilter],
          ['screen', hasScreen ? state.screenFilter : ''],
          ['sort', state.candidateSort === 'rank' ? '' : state.candidateSort]
        ];
        for (const [k, v] of pairs) {
          if (v) url.searchParams.set(k, v);
          else url.searchParams.delete(k);
        }
        root.history.replaceState(null, '', url);
      } catch {
        // Ignore history restrictions in synthetic contexts
      }
    }

    function scopedCandidates() {
      if (!state.selectedMeasureId) return state.candidates;
      return state.candidatesByMeasure.get(state.selectedMeasureId) || [];
    }

    function populateScopeDropdowns() {
      const base = scopedCandidates();
      if (hasScreen) {
        $('screenFilter').innerHTML = (hasBoundaries ? '<option value="review_candidates">Direct and connected (' + formatNumber(base.filter(reviewCandidate).length) + ')</option>' : '') + Object.entries(SCREEN_LABELS).filter(([value]) => hasBoundaries ? value !== 'substantive_connection' : !['direct_connection','connected_task'].includes(value)).map(([value, label]) =>
          '<option value="' + value + '">' + esc(label) + ' (' + formatNumber(base.filter(c => c.machine_screen?.classification === value).length) + ')</option>'
        ).join('') + (hasBoundaries ? '<option value="evidence_check">Needs evidence check (' + formatNumber(base.filter(needsEvidence).length) + ')</option>' : '') + (discovery.machine_screen.previous_plan_sha256 ? '<option value="changed">Added or removed from review (' + formatNumber(base.filter(changedCandidate).length) + ')</option>' : '') + '<option value="all">All screening results (' + formatNumber(base.length) + ')</option>';
        $('screenFilter').value = state.screenFilter;
      }
      const apps = [...new Set(base.map(c => c.publishing_app).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-GB'));
      const docTypes = [...new Set(base.map(c => c.document_type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-GB'));

      if (state.appFilter && !apps.includes(state.appFilter)) state.appFilter = '';
      if (state.docTypeFilter && !docTypes.includes(state.docTypeFilter)) state.docTypeFilter = '';

      $('appFilter').innerHTML = '<option value="">All apps (' + apps.length + ')</option>' +
        apps.map(a => '<option value="' + esc(a) + '">' + esc(humanizeToken(a)) + '</option>').join('');
      $('appFilter').value = state.appFilter;

      $('docTypeFilter').innerHTML = '<option value="">All document types (' + docTypes.length + ')</option>' +
        docTypes.map(t => '<option value="' + esc(t) + '">' + esc(humanizeToken(t)) + '</option>').join('');
      $('docTypeFilter').value = state.docTypeFilter;
    }

    function matchesAssessmentFilter(candidate, filterVal) {
      if (!filterVal) return true;
      const saved = getAssessmentFor(candidate);
      if (filterVal === 'assessed') return Boolean(saved);
      if (filterVal === 'unassessed') return !saved;
      if (filterVal.startsWith('topic:')) {
        return Boolean(saved && saved.assessment.topic_relevance === filterVal.slice(6));
      }
      if (filterVal.startsWith('impact:')) {
        return Boolean(saved && saved.assessment.change_impact === filterVal.slice(7));
      }
      return true;
    }

    function filteredCandidates() {
      const base = scopedCandidates();
      const needle = state.candidateQuery.trim().toLowerCase();

      const rows = base.filter(c => {
        if (state.screenFilter === 'evidence_check' ? !needsEvidence(c) : state.screenFilter === 'changed' ? !changedCandidate(c) : state.screenFilter === 'review_candidates' ? !reviewCandidate(c) : state.screenFilter !== 'all' && c.machine_screen?.classification !== state.screenFilter) return false;
        if (state.appFilter && c.publishing_app !== state.appFilter) return false;
        if (state.docTypeFilter && c.document_type !== state.docTypeFilter) return false;
        if (!matchesAssessmentFilter(c, state.assessmentFilter)) return false;
        if (state.draftFilter) {
          const linked = Boolean(resolveDraftLink(c));
          if (state.draftFilter === 'linked' && !linked) return false;
          if (state.draftFilter === 'unlinked' && linked) return false;
        }
        if (needle) {
          const orgs = formatOrganisations(c.organisations);
          const queries = state.discovery.lazy_details ? [] : (Array.isArray(c.matched_queries) ? c.matched_queries : []);
          const quotes = (state.discovery.lazy_details ? [] : (Array.isArray(c.passages) ? c.passages : [])).map(p => p && p.quote ? p.quote : '');
          const m = state.measureMap.get(c.measure_id);
          const haystack = [
            candidateTitle(c),
            c.family,
            c.url,
            c.publishing_app,
            c.document_type,
            c.measure_id,
            m ? m.label : '',
            ...orgs,
            ...formatOrganisations(c.taxons),
            ...queries,
            ...quotes
          ].join(' ').toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });

      return rows.slice().sort((a, b) => {
        if (state.candidateSort === 'score') {
          const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
          if (diff !== 0) return diff;
        } else if (state.candidateSort === 'title') {
          const diff = candidateTitle(a).localeCompare(candidateTitle(b), 'en-GB');
          if (diff !== 0) return diff;
        } else if (state.candidateSort === 'captured') {
          const diff = String(b.captured_at || '').localeCompare(String(a.captured_at || ''));
          if (diff !== 0) return diff;
        }
        const rankDiff = (Number(a.rank) || 999999) - (Number(b.rank) || 999999);
        if (rankDiff !== 0) return rankDiff;
        return candidateTitle(a).localeCompare(candidateTitle(b), 'en-GB');
      });
    }

    function filteredMeasures() {
      const needle = state.measureQuery.trim().toLowerCase();
      return state.measures.filter(m => {
        if (state.readinessFilter && m.readiness !== state.readinessFilter) return false;
        if (!needle) return true;
        return [m.id, m.label, m.readiness, m.readiness_reason].join(' ').toLowerCase().includes(needle);
      });
    }

    function renderMeasureRail() {
      const list = filteredMeasures();
      $('measureTotal').textContent = String(state.measures.length);
      $('measureCount').textContent = list.length + ' of ' + state.measures.length + ' measures';
      $('measureCount').hidden = list.length === state.measures.length;
      $('clearMeasureFilters').hidden = !(state.measureQuery || state.readinessFilter);
      $('measureEmpty').hidden = list.length > 0;

      const allRow = '<button type="button" class="measure-item' + (state.selectedMeasureId === '' ? ' active' : '') + '"' +
        (state.selectedMeasureId === '' ? ' aria-current="true"' : '') + ' data-measure="">All measures</button>';
      const measureRows = list.map(m => {
        const active = state.selectedMeasureId === m.id;
        return '<button type="button" class="measure-item' + (active ? ' active' : '') + '"' +
          (active ? ' aria-current="true"' : '') + ' data-measure="' + esc(m.id) + '">' +
          '<span class="measure-label">' + esc(m.label) + '</span>' +
          '<span class="measure-code">' + esc(m.id) + '</span></button>';
      }).join('');

      $('measureList').innerHTML = allRow + measureRows;
      $('measureList').querySelectorAll('[data-measure]').forEach(btn => {
        btn.addEventListener('click', () => selectMeasure(btn.dataset.measure, true));
      });
    }

    function renderContextBar() {
      const m = state.selectedMeasureId ? state.measureMap.get(state.selectedMeasureId) : null;
      const base = scopedCandidates();
      const allUnclassified = base.length > 0 && base.every(c =>
        (!c.stage || c.stage === 'discovered') &&
        (!c.topic_relevance || c.topic_relevance === 'unassessed') &&
        (!c.change_impact || c.change_impact === 'unassessed')
      );

      $('savedTotalCount').textContent = String(countSavedAssessments(''));

      if (m) {
        $('measureTitle').textContent = m.label;
        const draftCount = pilotCountByMeasure.get(m.id) || 0;
        const link = $('draftMeasureLink');
        link.href = 'drafts.html?measure=' + encodeURIComponent(m.id);
        link.textContent = 'Related drafts (' + draftCount + ')';
        link.hidden = draftCount === 0;

        const reportedCount = typeof m.candidate_count === 'number' ? m.candidate_count : base.length;
        const totalMatches = typeof m.total_matches === 'number' ? m.total_matches : reportedCount;
        const truncatedNote = (m.truncated || totalMatches > reportedCount)
          ? '<span class="tag tag-amber">Truncated export: ' + esc(formatNumber(reportedCount)) + ' of ' + esc(formatNumber(totalMatches)) + ' matches</span>'
          : '';

        const stageNote = hasScreen
          ? '<span>AI relevance screened; assess change impact separately</span>'
          : allUnclassified
          ? '<span>No automated classification has been run yet</span>'
          : base.length === 0
            ? '<span>No retrieved candidates exported for this measure</span>'
            : '<span>Inspect supplied stage and relevance fields per candidate</span>';

        $('measureMeta').innerHTML =
          '<span class="' + readinessTagClass(m.readiness) + '">' + esc(readinessLabel(m.readiness)) + '</span>' +
          (m.readiness_reason ? '<span class="reason-text">' + esc(m.readiness_reason) + '</span>' : '') +
          truncatedNote +
          stageNote +
          '<span class="tabular">' + (state.discovery.review_collection ? 'Collection ' : 'Run ') + esc(state.discovery.run_id) + ' · Exported ' + esc(formatDateShort(state.discovery.generated_at)) + '</span>';

        const ev = Array.isArray(m.evidence) ? m.evidence : [];
        if (ev.length) {
          $('measureEvidenceWrap').hidden = false;
          $('measureEvidenceWrap').innerHTML =
            '<details><summary>Measure policy basis and evidence (' + ev.length + ' excerpt' + (ev.length === 1 ? '' : 's') + ')</summary>' +
            ev.map(item =>
              '<div class="measure-evidence-item">' +
                '<p class="measure-evidence-locator">' + esc(item.locator || item.id || 'Evidence excerpt') + '</p>' +
                '<p class="measure-evidence-text">' + esc(item.text || '') + '</p>' +
                '<details class="provenance-details" style="margin-top:8px;padding-top:8px">' +
                  '<summary>Source path and hash</summary>' +
                  '<dl class="provenance-list">' +
                    '<dt>Evidence ID</dt><dd class="mono">' + esc(item.id || 'Not recorded') + '</dd>' +
                    '<dt>Path</dt><dd class="mono">' + esc(item.path || 'Not recorded') + '</dd>' +
                    '<dt>SHA-256</dt><dd class="mono">' + esc(item.sha256 || 'Not recorded') + '</dd>' +
                  '</dl>' +
                '</details>' +
              '</div>'
            ).join('') +
            '</details>';
        } else {
          $('measureEvidenceWrap').hidden = true;
          $('measureEvidenceWrap').innerHTML = '';
        }
      } else {
        $('measureTitle').textContent = 'All measures';
        const link = $('draftMeasureLink');
        link.href = 'drafts.html';
        link.hidden = false;
        link.textContent = 'Draft collection' + (pilotPages.length ? ' (' + formatNumber(pilotPages.length) + ')' : '');

        const readyN = state.measures.filter(x => x.readiness === 'ready').length;
        const provN = state.measures.filter(x => x.readiness === 'provisional').length;
        const blockedN = state.measures.filter(x => x.readiness === 'blocked').length;

        $('measureMeta').innerHTML =
          '<span class="tag tag-ready tabular">' + readyN + ' ready</span>' +
          '<span class="tag tag-provisional tabular">' + provN + ' provisional</span>' +
          '<span class="tag tag-blocked tabular">' + blockedN + ' blocked</span>' +
          (allUnclassified ? '<span>No automated classification has been run yet</span>' : '') +
          '<span class="tabular">' + (state.discovery.review_collection ? 'Collection ' : 'Run ') + esc(state.discovery.run_id) + ' · Exported ' + esc(formatDateShort(state.discovery.generated_at)) + '</span>';

        $('measureEvidenceWrap').hidden = true;
        $('measureEvidenceWrap').innerHTML = '';
      }
    }

    function renderCoveragePanel() {
      const cov = normalizeCoverage(state.discovery.coverage);
      const catalogueOnly = catalogueMeasures.filter(cm => !state.measureMap.has(cm.id));

      const appRows = cov.byApp.length
        ? cov.byApp.map(row =>
            '<tr><td>' + esc(humanizeToken(row.app)) + '</td><td class="num">' +
            esc(formatNumber(row.count)) +
            '</td></tr>'
          ).join('')
        : '<tr><td colspan="2">Publishing-app breakdown was not included in this export.</td></tr>';

      const extraRows = cov.extra.map(item => {
        const val = Array.isArray(item.value)
          ? item.value.join(', ')
          : (typeof item.value === 'object' ? JSON.stringify(item.value) : (typeof item.value === 'number' ? formatNumber(item.value) : String(item.value)));
        return '<tr><td>' + esc(humanizeToken(item.key)) + '</td><td class="num">' + esc(val) + '</td></tr>';
      }).join('');

      const limitationsHtml = cov.limitations.length
        ? '<ul class="limitations-list">' + cov.limitations.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>'
        : '<p class="panel-lead">No explicit extraction limitations were listed in this export. Still verify whether relevant guidance lives in binary attachments or publishing apps outside this capture.</p>';

      $('coverageBody').innerHTML =
        '<p class="panel-lead">Coverage figures below are read directly from this local discovery export (<span class="mono">' + esc(state.discovery.run_id) + '</span>, generated ' + esc(formatDateTime(state.discovery.generated_at)) + ').</p>' +
        '<div class="coverage-grid">' +
          '<div class="coverage-block">' +
            '<h3>Captured corpus scope</h3>' +
            '<table class="coverage-table">' +
              '<thead><tr><th scope="col">Surface category</th><th scope="col" class="num">Count</th></tr></thead>' +
              '<tbody>' +
                '<tr><td>Searchable captured text surfaces</td><td class="num">' + esc(formatNumber(cov.textSurfaces)) + '</td></tr>' +
                '<tr><td>Binary attachment surfaces outside text search (not necessarily guidance or unique files)</td><td class="num">' + esc(formatNumber(cov.unclassifiedBinaries)) + '</td></tr>' +
                '<tr><td>Other unresolved surfaces outside text search</td><td class="num">' + esc(formatNumber(cov.otherUnresolved)) + '</td></tr>' +
                extraRows +
              '</tbody>' +
            '</table>' +
          '</div>' +
          '<div class="coverage-block">' +
            '<h3>Searchable text surfaces by publishing app</h3>' +
            '<table class="coverage-table">' +
              '<thead><tr><th scope="col">Publishing app</th><th scope="col" class="num">Surfaces</th></tr></thead>' +
              '<tbody>' + appRows + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
        '<div class="coverage-block" style="margin-top:18px">' +
          '<h3>Extraction gaps and frame limitations</h3>' +
          limitationsHtml +
          (catalogueOnly.length
            ? '<p class="panel-lead" style="margin-top:10px">' + catalogueOnly.length + ' measure(s) in the local catalogue were not included in this discovery export: ' + esc(catalogueOnly.map(x => x.id).join(', ')) + '.</p>'
            : '') +
        '</div>' +
        '<p class="coverage-reminder"><strong>Zero results never means no affected guidance.</strong> Check measure readiness, query basis, binary attachments outside text search and apps outside the capture frame.</p>';
    }

    function renderAssessmentsPanel() {
      const records = Object.values(state.assessments);
      $('exportAssessments').disabled = records.length === 0;

      if (records.length === 0) {
        $('savedAssessmentsSummary').innerHTML = '<p class="panel-lead">No assessments are saved on this device for run <span class="mono">' + esc(state.discovery.run_id) + '</span> yet.</p>';
        return;
      }

      const byMeasure = new Map();
      for (const r of records) {
        const mid = r.binding.measure_id;
        byMeasure.set(mid, (byMeasure.get(mid) || 0) + 1);
      }

      $('savedAssessmentsSummary').innerHTML =
        '<p class="panel-lead"><strong>' + records.length + ' assessment' + (records.length === 1 ? '' : 's') + '</strong> ' +
        (state.unsyncedAssessments ? 'held in this session; browser storage failed. Download a backup before leaving.' : 'saved on this device.') +
        ' Run <span class="mono">' + esc(state.discovery.run_id) + '</span>, across ' + byMeasure.size + ' measure' + (byMeasure.size === 1 ? '' : 's') + '.</p>' +
        '<ul class="saved-summary-list">' +
          [...byMeasure.entries()].map(([mid, count]) => {
            const m = state.measureMap.get(mid);
            return '<li><span><strong>' + esc(mid) + '</strong>' + (m ? ' · ' + esc(m.label) : '') + '</span>' +
              '<span><span class="tabular">' + count + ' saved</span> · <button type="button" class="link-btn" data-jump-measure="' + esc(mid) + '">View measure</button></span></li>';
          }).join('') +
        '</ul>';

      $('savedAssessmentsSummary').querySelectorAll('[data-jump-measure]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.assessmentFilter = 'assessed';
          $('assessmentFilter').value = 'assessed';
          selectMeasure(btn.dataset.jumpMeasure, false);
          toggleUtilityPanel(null, false);
        });
      });
    }

    function toggleUtilityPanel(name, focusClose) {
      const next = state.activeUtilityPanel === name ? null : name;
      state.activeUtilityPanel = next;

      $('coveragePanel').hidden = next !== 'coverage';
      $('assessmentsPanel').hidden = next !== 'assessments';
      $('toggleCoverage').setAttribute('aria-expanded', String(next === 'coverage'));
      $('toggleAssessments').setAttribute('aria-expanded', String(next === 'assessments'));

      if (next === 'coverage') {
        renderCoveragePanel();
        if (focusClose) $('closeCoverage').focus();
      } else if (next === 'assessments') {
        renderAssessmentsPanel();
        if (focusClose) $('closeAssessments').focus();
      }
    }

    function renderCandidateList() {
      bufferCurrentForm();
      const base = scopedCandidates();
      const rows = filteredCandidates();
      const m = state.selectedMeasureId ? state.measureMap.get(state.selectedMeasureId) : null;
      const hasActiveFilters = Boolean(
        state.candidateQuery || state.appFilter || state.docTypeFilter || state.assessmentFilter || state.draftFilter || state.screenFilter !== 'all'
      );

      $('clearCandidateFilters').hidden = !hasActiveFilters;

      let countMsg = formatNumber(rows.length) + (state.selectedMeasureId ? ' pages' : ' page–measure matches');
      if (rows.length !== base.length) countMsg += ' of ' + formatNumber(base.length) + ' in this list';
      else if (m && m.total_matches > base.length) countMsg += ' · first ' + formatNumber(base.length) + ' of ' + formatNumber(m.total_matches) + ' search matches';
      const familyCount = new Set(rows.map(c => c.family || c.url)).size;
      if (hasScreen) countMsg += ' · ' + formatNumber(familyCount) + (familyCount === 1 ? ' publication family' : ' publication families');
      $('candidateCount').textContent = countMsg;
      $('candidatePaneMeta').textContent = formatNumber(rows.length) + ' shown';

      if (rows.length === 0) {
        $('queuePagination').hidden = true;
        $('candidateList').innerHTML = '';
        $('candidateEmpty').hidden = false;

        if (base.length === 0) {
          const reasonHtml = m && m.readiness_reason
            ? '<p><strong>Readiness (' + esc(readinessLabel(m.readiness)) + '):</strong> ' + esc(m.readiness_reason) + '</p>'
            : '';
          $('candidateEmpty').innerHTML =
            '<p><strong>No retrieved candidates exported for this measure.</strong></p>' +
            '<p>Zero results never means no affected guidance. Check measure readiness, search queries, binary attachments outside text search and apps outside the capture frame.</p>' +
            reasonHtml +
            '<p><button type="button" class="link-btn" id="emptyOpenCoverage">Inspect coverage and extraction gaps</button></p>';
          const covBtn = $('emptyOpenCoverage');
          if (covBtn) covBtn.addEventListener('click', () => toggleUtilityPanel('coverage', true));
        } else {
          $('candidateEmpty').innerHTML =
            '<p><strong>No candidates match the current filters.</strong> ' + esc(formatNumber(base.length)) + ' exported candidate' + (base.length === 1 ? '' : 's') + ' remain in this scope.</p>' +
            '<p>Scope filters hide non-matching rows temporarily and never discard records.</p>' +
            '<p><button type="button" id="emptyClearFilters">Clear all filters</button></p>';
          const clr = $('emptyClearFilters');
          if (clr) clr.addEventListener('click', clearCandidateFilters);
        }

        state.selectedCandidateId = '';
        renderDetail(rows);
        syncUrl();
        return;
      }

      $('candidateEmpty').hidden = true;
      if (!rows.some(c => c.id === state.selectedCandidateId)) {
        state.selectedCandidateId = rows[0].id;
      }

      const selectedIndex = rows.findIndex(c => c.id === state.selectedCandidateId);
      state.queuePage = Math.floor(selectedIndex / state.queuePageSize);
      const pageStart = state.queuePage * state.queuePageSize;
      const visibleRows = rows.slice(pageStart, pageStart + state.queuePageSize);
      $('queuePagination').hidden = rows.length <= state.queuePageSize;
      $('queuePageLabel').textContent = (pageStart + 1) + '–' + (pageStart + visibleRows.length) + ' of ' + formatNumber(rows.length);
      $('queuePreviousPage').disabled = state.queuePage === 0;
      $('queueNextPage').disabled = pageStart + visibleRows.length >= rows.length;
      $('candidatePaneMeta').textContent = visibleRows.length + ' on this page';

      $('candidateList').innerHTML = visibleRows.map(c => {
        const active = c.id === state.selectedCandidateId;
        const saved = getAssessmentFor(c);
        return '<button type="button" class="candidate-row' + (active ? ' active' : '') + '"' +
          (active ? ' aria-current="true"' : '') + ' data-candidate="' + esc(c.id) + '">' +
          '<span class="candidate-title">' + esc(candidateTitle(c)) + '</span>' +
          (hasBoundaries && c.machine_screen ? '<span class="candidate-meta-line">' + esc(SCREEN_LABELS[c.machine_screen.classification] || 'Uncertain') + (needsEvidence(c) ? ' · check evidence' : '') + '</span>' : '') +
          (!state.selectedMeasureId ? '<span class="candidate-meta-line">' + esc(c.measure_id) + '</span>' : '') +
          (saved ? '<span class="candidate-meta-line">Reviewed on this device</span>' : '') + '</button>';
      }).join('');

      $('candidateList').querySelectorAll('[data-candidate]').forEach(btn => {
        btn.addEventListener('click', () => selectCandidate(btn.dataset.candidate, true));
      });

      renderDetail(rows);
      syncUrl();
    }

    async function loadCandidateDetails(c) {
      if (!c.detail_file || c.details_state === 'loading' || c.details_state === 'loaded' || c.details_state === 'failed') return;
      c.details_state = 'loading';
      try {
        if (!/^[a-f0-9]{64}$/.test(c.id) || c.detail_file !== 'candidate-details/' + c.id + '.json') throw Error('Invalid evidence file binding.');
        const response = await root.fetch(c.detail_file, {cache:'no-store'});
        if (!response.ok) throw Error('The evidence file could not be loaded.');
        const raw = await response.text();
        const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
        if (actual !== c.detail_sha256) throw Error('The evidence file failed its integrity check.');
        const detail = JSON.parse(raw);
        if (detail.id !== c.id || detail.text_hash !== c.text_hash || !Array.isArray(detail.passages)) throw Error('The evidence belongs to a different page.');
        c.passages = detail.passages;
        c.screen_evidence = detail.screen_evidence || [];
        c.matched_queries = detail.matched_queries || [];
        c.details_state = 'loaded';
      } catch (error) {
        c.details_state = 'failed';
        c.details_error = error.message || 'Evidence could not be loaded.';
      }
      if (state.activeFormCandidateId === c.id) {
        bufferCurrentForm();
        renderDetail(filteredCandidates());
      }
    }

    function renderDetail(visibleRows) {
      const idx = visibleRows.findIndex(c => c.id === state.selectedCandidateId);
      const c = idx >= 0 ? visibleRows[idx] : null;

      if (!c) {
        state.activeFormCandidateId = '';
        state.textCandidateId = '';
        state.textRequest++;
        $('detailEmpty').hidden = false;
        $('detailContent').hidden = true;
        return;
      }

      $('detailEmpty').hidden = true;
      $('detailContent').hidden = false;
      state.activeFormCandidateId = c.id;
      const formKey = buildAssessmentKey(state.discovery.run_id, c);
      const buffered = state.formBuffers.get(formKey);
      state.formDirty = Boolean(buffered);
      if (state.textCandidateId !== c.id) {
        state.textCandidateId = c.id;
        state.textRequest++;
        $('completeText').textContent = '';
        $('completeText').hidden = true;
        $('completeTextStatus').textContent = '';
        $('completeTextDetails').open = false;
        $('loadCompleteText').disabled = !c.captured_text_file;
        $('loadCompleteText').textContent = 'Load complete captured text';
        if (!c.captured_text_file) $('completeTextStatus').textContent = 'Complete captured text was not included in this export.';
      }

      $('detailPosition').textContent = 'Candidate ' + (idx + 1) + ' of ' + visibleRows.length;
      $('prevCandidate').disabled = idx <= 0;
      $('nextCandidate').disabled = idx >= visibleRows.length - 1;

      $('detailTitle').textContent = candidateTitle(c);
      const govukUrl = safeHref(c.url);
      if (govukUrl) {
        $('detailGovukLink').href = govukUrl;
        $('detailGovukLink').hidden = false;
      } else {
        $('detailGovukLink').hidden = true;
      }

      const orgs = formatOrganisations(c.organisations);
      const measureObj = state.measureMap.get(c.measure_id);
      const scoreText = typeof c.score === 'number' && Number.isFinite(c.score) ? ' · score ' + c.score.toFixed(2) : '';
      $('detailSourceSummary').textContent = 'Captured ' + formatDateShort(c.captured_at);

      $('detailMetadata').innerHTML =
        '<div><dt>Exact page / surface</dt><dd>' + esc(c.title || 'Not recorded') + '</dd></div>' +
        '<div><dt>Publication family</dt><dd>' + esc(c.family || 'Not grouped into a wider family') + '</dd></div>' +
        '<div><dt>Measure in view</dt><dd>' + esc(c.measure_id + (measureObj ? ' · ' + measureObj.label : '')) + '</dd></div>' +
        '<div><dt>Retrieval rank</dt><dd class="tabular">#' + esc(c.rank != null ? c.rank : '—') + esc(scoreText) + '</dd></div>' +
        '<div><dt>Publishing app</dt><dd>' + esc(humanizeToken(c.publishing_app)) + '</dd></div>' +
        '<div><dt>Document type</dt><dd>' + esc(humanizeToken(c.document_type)) + '</dd></div>' +
        '<div><dt>Organisations</dt><dd>' + esc(orgs.length ? orgs.join('; ') : 'Not recorded') + '</dd></div>' +
        '<div><dt>GOV.UK topics</dt><dd>' + esc(formatOrganisations(c.taxons).join('; ') || 'Not recorded') + '</dd></div>' +
        '<div><dt>Captured</dt><dd class="tabular">' + esc(formatDateTime(c.captured_at)) + '</dd></div>';

      // Draft collection cross-link
      const draft = resolveDraftLink(c);
      const draftBox = $('detailDraftBox');
      if (draft && draft.page) {
        draftBox.className = 'draft-link-box has-draft';
        const hasEdits = Array.isArray(draft.page.sections) && draft.page.sections.some(s => s.before !== s.after);
        const matchLabel = draft.matchType === 'same_publication_family' ? 'Existing draft in the same publication family' : 'Existing draft for this exact page and measure';
        draftBox.innerHTML =
          '<div><strong>' + esc(matchLabel) + ':</strong> ' + esc(draft.page.title) +
          ' <span class="candidate-stage-note">(' + (hasEdits ? 'has unapproved draft chapters' : 'recorded with no supplied amendment in its reviewed scope') + ')</span></div>' +
          '<a class="action-link" href="drafts.html?page=' + esc(encodeURIComponent(draft.page.id)) + '">Open in Draft collection</a>';
      } else if (draft && draft.rawDraftId) {
        draftBox.className = 'draft-link-box has-draft';
        draftBox.innerHTML =
          '<div><strong>Draft collection reference:</strong> <span class="mono">' + esc(draft.rawDraftId) + '</span></div>' +
          '<a class="action-link" href="drafts.html?page=' + esc(encodeURIComponent(draft.rawDraftId)) + '">Open in Draft collection</a>';
      } else {
        draftBox.className = 'draft-link-box';
        draftBox.innerHTML =
          '<div>No draft entry is linked for this page in the current Draft collection. Discovery and assessment remain useful even where no edit is needed.</div>';
      }

      // Multiple measures mapping to this page
      const surfaceKey = c.surface_id || normalizeUrl(c.url) || c.id;
      const siblings = (state.candidatesBySurface.get(surfaceKey) || []).filter(other => other.id !== c.id);
      if (siblings.length) {
        $('detailOtherMeasures').hidden = false;
        $('otherMeasuresList').innerHTML =
          '<p class="machine-note" style="margin:0 0 10px">This captured surface also matched ' + siblings.length + ' other measure' + (siblings.length === 1 ? '' : 's') + '. Assessments are stored separately per measure.</p>' +
          '<div class="other-measures-list">' +
          siblings.map(other => {
            const om = state.measureMap.get(other.measure_id);
            const otherSaved = getAssessmentFor(other);
            return '<button type="button" class="other-measure-btn" data-jump-candidate="' + esc(other.id) + '" data-jump-measure="' + esc(other.measure_id) + '">' +
              '<strong>' + esc(other.measure_id) + '</strong>' +
              (om ? ' · ' + esc(om.label) : '') +
              ' <span class="tabular">(#' + esc(other.rank != null ? other.rank : '—') + ')</span>' +
              (otherSaved ? ' · assessed locally' : '') +
              '</button>';
          }).join('') +
          '</div>';

        $('otherMeasuresList').querySelectorAll('[data-jump-candidate]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.selectedMeasureId = btn.dataset.jumpMeasure;
            state.selectedCandidateId = btn.dataset.jumpCandidate;
            populateScopeDropdowns();
            if (!filteredCandidates().some(item => item.id === state.selectedCandidateId)) {
              state.candidateQuery = '';
              state.appFilter = '';
              state.docTypeFilter = '';
              state.assessmentFilter = '';
              state.draftFilter = '';
              state.screenFilter = 'all';
              $('candidateSearch').value = '';
              $('appFilter').value = '';
              $('docTypeFilter').value = '';
              $('assessmentFilter').value = '';
              $('draftFilter').value = '';
              $('screenFilter').value = 'all';
            }
            renderAll();
            $('detailTitle').focus({ preventScroll: false });
          });
        });
      } else {
        $('detailOtherMeasures').hidden = true;
        $('otherMeasuresList').innerHTML = '';
      }

      // Matched queries & passages
      const queries = Array.isArray(c.matched_queries) ? c.matched_queries.filter(Boolean) : [];
      $('detailQueries').innerHTML = queries.length
        ? '<ul class="query-list" aria-label="Matched search queries">' +
            queries.map(q => '<li class="query-term">' + esc(q) + '</li>').join('') +
          '</ul>'
        : '<p class="machine-note" style="margin:0 0 12px">No matched query terms were recorded for this entry.</p>';

      const retrievalPassages = Array.isArray(c.passages) ? c.passages.filter(p => p && p.quote) : [];
      const supportingPassages = Array.isArray(c.screen_evidence) ? c.screen_evidence : [];
      const passages = supportingPassages.concat(retrievalPassages.filter(p => !supportingPassages.some(e => e.start === p.start && e.end === p.end)));
      $('detailLocations').innerHTML = passages.map((p, i) =>
        typeof p.start === 'number' && typeof p.end === 'number'
          ? '<p class="passage-caption">Passage ' + (i + 1) + ' · characters ' + esc(formatNumber(p.start)) + '–' + esc(formatNumber(p.end)) + '</p>' : '').join('');
      if (passages.length) {
        const excerpt = p => '<figure class="passage-card">' + (p.route === 'screen_evidence' ? '<figcaption class="passage-caption">Passage selected by AI' + (p.context_added ? ', with surrounding context' : ' for this connection') + '</figcaption>' : '') + '<blockquote>' + capturedMarkup(p.quote,p.structure) + '</blockquote></figure>';
        $('detailPassages').innerHTML = excerpt(passages[0]) + (passages.length > 1
          ? '<details class="more-passages"><summary>More matching passages (' + (passages.length - 1) + ')</summary>' + passages.slice(1).map(excerpt).join('') + '</details>' : '');
      } else {
        $('detailPassages').innerHTML =
          '<p class="machine-note">No passage excerpts were exported for this candidate. Inspect the GOV.UK page directly before drawing conclusions.</p>';
      }

      if (c.detail_file && c.details_state !== 'loaded') {
        $('detailPassages').innerHTML = c.details_state === 'failed'
          ? '<p class="machine-note">' + esc(c.details_error) + '</p><button type="button" id="retryCandidateDetails">Try loading evidence again</button>'
          : '<p class="machine-note">Loading captured evidence…</p>';
        if (c.details_state === 'failed') $('retryCandidateDetails').onclick = () => { c.details_state = ''; loadCandidateDetails(c); };
        else loadCandidateDetails(c);
      }

      // Supplied machine record (kept strictly separate from Your assessment)
      const stageVal = c.stage || 'discovered';
      const relVal = c.topic_relevance || 'unassessed';
      const impVal = c.change_impact || 'unassessed';
      const curVal = c.currency || 'unknown';
      const screen = c.machine_screen;
      $('detailScreen').hidden = !screen;
      $('detailScreen').textContent = screen
        ? 'AI relevance: ' + (SCREEN_LABELS[screen.classification] || 'Uncertain') + (needsEvidence(c) ? '. No supporting passage selected — check the captured text.' : '') : '';
      const isRawDiscovery = stageVal === 'discovered' && relVal === 'unassessed' && impVal === 'unassessed';

      $('machineStateBody').innerHTML =
        '<dl class="machine-grid">' +
          '<div><dt>Pipeline stage</dt><dd>' + esc(STAGE_LABELS[stageVal] || humanizeToken(stageVal)) + '</dd></div>' +
          '<div><dt>Record origin</dt><dd>Automated corpus retrieval · run <span class="mono">' + esc(c.retrieval_run_id || state.discovery.run_id) + '</span></dd></div>' +
          '<div><dt>Supplied topic relevance</dt><dd>' + esc(MACHINE_VALUE_LABELS[relVal] || humanizeToken(relVal)) + '</dd></div>' +
          (screen ? '<div><dt>AI screen</dt><dd>' + esc(SCREEN_LABELS[screen.classification] || 'Uncertain') + ' · complete captured text · ' + esc(screen.chunks_answered) + ' chunk(s)</dd></div>' : '') +
          (screen?.previous_classification ? '<div><dt>Previous AI screen</dt><dd>' + esc(SCREEN_LABELS[screen.previous_classification]) + '</dd></div>' : '') +
          '<div><dt>Supplied change impact</dt><dd>' + esc(MACHINE_VALUE_LABELS[impVal] || humanizeToken(impVal)) + '</dd></div>' +
          '<div><dt>Guidance currency</dt><dd>' + esc(MACHINE_VALUE_LABELS[curVal] || humanizeToken(curVal)) + '</dd></div>' +
        '</dl>' +
        (hasBoundaries ? '<p class="machine-note">Direct guidance explains a task at the centre of the measure. Connected guidance explains a supporting employment task. Neither confirms that an edit is needed.</p>' : '') +
        '<p class="machine-note">' +
          (isRawDiscovery
            ? 'This hit comes from search retrieval only. Automated classification has not been run yet; do not treat retrieval as confirmation that the page is affected.'
            : 'Supplied fields come from the discovery export and remain separate from your device-local assessment below.') +
        '</p>';

      // Populate Your assessment form
      const saved = getAssessmentFor(c);
      const displayed = buffered || (saved ? saved.assessment : {});
      $('assessTopic').value = displayed.topic_relevance || '';
      $('assessImpact').value = displayed.change_impact || '';
      $('assessNotes').value = displayed.notes || '';
      $('clearAssessment').hidden = !saved;
      $('discardUnsaved').hidden = !buffered;

      const statusEl = $('assessmentStatus');
      statusEl.className = 'status-message';
      if (buffered) {
        statusEl.classList.add('is-dirty');
        statusEl.textContent = 'Unsaved changes retained while you browse. Select Save assessment to keep them.';
      } else if (state.storageWarning) {
        statusEl.classList.add('is-error');
        statusEl.textContent = state.storageWarning;
      } else if (saved) {
        statusEl.textContent = 'Saved on this device (' + formatDateTime(saved.assessment.updated_at) + '). Not policy approval.';
      } else {
        statusEl.textContent = 'Not yet assessed on this device.';
      }

      // Secondary provenance disclosure
      const key = buildAssessmentKey(state.discovery.run_id, c);
      const passageHashes = passages.map((p, i) =>
        'Excerpt ' + (i + 1) + ': ' + (p.text_sha256 || 'unhashed') +
        (typeof p.start === 'number' && typeof p.end === 'number' ? ' [' + p.start + '..' + p.end + ']' : '')
      );

      $('detailProvenanceBody').innerHTML =
        '<dl class="provenance-list">' +
          '<dt>Retrieval run ID</dt><dd class="mono">' + esc(c.retrieval_run_id || state.discovery.run_id) + '</dd>' +
          '<dt>Candidate ID</dt><dd class="mono">' + esc(c.id || 'Not recorded') + '</dd>' +
          '<dt>Surface ID</dt><dd class="mono">' + esc(c.surface_id || 'Not recorded') + '</dd>' +
          '<dt>Measure ID</dt><dd class="mono">' + esc(c.measure_id || 'Not recorded') + '</dd>' +
          '<dt>Raw URL</dt><dd class="mono">' + esc(c.url || 'Not recorded') + '</dd>' +
          '<dt>Raw captured_at</dt><dd class="mono">' + esc(c.captured_at || 'Not recorded') + '</dd>' +
          '<dt>Score</dt><dd class="mono">' + esc(c.score != null ? String(c.score) : 'Not recorded') + '</dd>' +
          '<dt>Passage hashes</dt><dd class="mono">' + esc(passageHashes.length ? passageHashes.join(' | ') : 'None exported') + '</dd>' +
          '<dt>Local assessment key</dt><dd class="mono">' + esc(key) + '</dd>' +
        '</dl>';
    }

    function renderAll() {
      renderMeasureRail();
      renderContextBar();
      renderCandidateList();
      if (state.activeUtilityPanel === 'coverage') renderCoveragePanel();
      if (state.activeUtilityPanel === 'assessments') renderAssessmentsPanel();
    }

    function selectMeasure(measureId, fromUser) {
      state.selectedMeasureId = measureId;
      state.selectedCandidateId = '';
      populateScopeDropdowns();
      renderAll();
      if (fromUser) {
        $('measureRail').classList.remove('rail-open');
        $('toggleMeasures').setAttribute('aria-expanded', 'false');
        $('measureTitle').focus({ preventScroll: true });
        if (root.scrollTo) root.scrollTo(0, 0);
      }
    }

    function selectCandidate(candidateId, fromUser) {
      state.selectedCandidateId = candidateId;
      renderCandidateList();
      if (fromUser && root.innerWidth && root.innerWidth <= 1080) {
        $('detailTitle').focus({ preventScroll: false });
      }
    }

    function clearCandidateFilters() {
      state.candidateQuery = '';
      state.appFilter = '';
      state.docTypeFilter = '';
      state.assessmentFilter = '';
      state.draftFilter = '';
      state.screenFilter = 'all';
      $('candidateSearch').value = '';
      $('appFilter').value = '';
      $('docTypeFilter').value = '';
      $('assessmentFilter').value = '';
      $('draftFilter').value = '';
      $('screenFilter').value = 'all';
      renderCandidateList();
    }

    function markFormDirty() {
      state.formDirty = true;
      bufferCurrentForm();
      const statusEl = $('assessmentStatus');
      statusEl.className = 'status-message' + (state.formDirty ? ' is-dirty' : '');
      statusEl.textContent = state.formDirty ? 'Unsaved changes — select Save assessment to keep on this device.' : 'No unsaved changes.';
      $('discardUnsaved').hidden = !state.formDirty;
    }

    async function loadCompleteText() {
      const c = state.candidates.find(candidate => candidate.id === state.activeFormCandidateId);
      if (!c) return;
      const expected = candidateTextHash(c);
      const expectedFile = 'captured-text/' + expected + '.json';
      const status = $('completeTextStatus');
      if (!/^[a-f0-9]{64}$/.test(expected) || c.captured_text_file !== expectedFile) {
        status.textContent = 'Complete text is unavailable or its evidence binding is invalid.';
        return;
      }
      const request = ++state.textRequest;
      const stillCurrent = () => state.textRequest === request && state.activeFormCandidateId === c.id;
      $('loadCompleteText').disabled = true;
      status.textContent = 'Loading the complete captured text…';
      try {
        const response = await root.fetch(expectedFile, {cache:'no-store'});
        if (!response.ok) throw Error('The local text file could not be loaded.');
        const payload = await response.json();
        if (payload.text_sha256 !== expected || typeof payload.text !== 'string') throw Error('The captured text binding does not match this page.');
        if (!root.crypto || !root.crypto.subtle) throw Error('Text verification is unavailable. Open this workspace on localhost.');
        const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.text));
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
        if (actual !== expected) throw Error('The captured text failed its integrity check.');
        if (!stillCurrent()) return;
        const structure = payload.structures?.[c.structure_key];
        if (Array.isArray(structure) && structure.length) $('completeText').innerHTML = capturedMarkup(payload.text,structure);
        else $('completeText').textContent = payload.text;
        $('completeText').hidden = false;
        status.textContent = 'Complete captured text loaded and verified (' + formatNumber(Array.from(payload.text).length) + ' characters). No text has been shortened.';
        $('loadCompleteText').textContent = 'Complete text loaded';
      } catch (error) {
        if (!stillCurrent()) return;
        status.textContent = (error && error.message ? error.message : 'The captured text could not be loaded.') + ' Check that the local review server is running, then try again.';
        $('loadCompleteText').disabled = false;
      }
    }

    function saveCurrentAssessment(event) {
      if (event && event.preventDefault) event.preventDefault();
      const rows = filteredCandidates();
      const c = rows.find(x => x.id === state.selectedCandidateId);
      if (!c) return;

      const topic = $('assessTopic').value;
      const impact = $('assessImpact').value;
      const notes = $('assessNotes').value;

      const statusEl = $('assessmentStatus');
      if (!topic && !impact && !notes.trim()) {
        statusEl.className = 'status-message is-error';
        statusEl.textContent = 'Choose a topic relevance, choose a change impact, or enter notes before saving.';
        return;
      }
      if (!candidateTextHash(c)) {
        statusEl.className = 'status-message is-error';
        statusEl.textContent = 'This candidate has no captured text hash. An assessment cannot be bound safely.';
        return;
      }

      const key = buildAssessmentKey(state.discovery.run_id, c);
      const now = new Date().toISOString();
      state.assessments[key] = {
        key,
        binding: {
          run_id: state.discovery.run_id,
          measure_id: c.measure_id,
          surface_id: c.surface_id || c.id,
          text_hash: candidateTextHash(c),
          candidate_id: c.id
        },
        machine: {
          stage: c.stage || 'discovered',
          topic_relevance: c.topic_relevance || 'unassessed',
          change_impact: c.change_impact || 'unassessed',
          currency: c.currency || 'unknown'
        },
        assessment: {
          topic_relevance: topic,
          change_impact: impact,
          notes,
          updated_at: now
        },
        origin: 'device_local_reviewer'
      };

      const persisted = persistAssessments();
      state.formBuffers.delete(key);
      state.formDirty = false;
      renderMeasureRail();
      renderContextBar();
      renderCandidateList();
      if (state.activeUtilityPanel === 'assessments') renderAssessmentsPanel();

      const updatedStatus = state.selectedCandidateId === c.id ? $('assessmentStatus') : $('workspaceStatus');
      updatedStatus.className = 'status-message';
      if (persisted.ok) {
        updatedStatus.textContent = 'Saved assessment for “' + (c.title || c.url) + '” on this device (' + formatDateTime(now) + '). Not policy approval.';
      } else {
        updatedStatus.classList.add('is-error');
        updatedStatus.textContent = persisted.error;
      }
    }

    function clearCurrentAssessment() {
      const rows = filteredCandidates();
      const c = rows.find(x => x.id === state.selectedCandidateId);
      if (!c) return;

      const key = buildAssessmentKey(state.discovery.run_id, c);
      if (!state.assessments[key]) return;

      const backup = state.assessments[key];
      delete state.assessments[key];
      const persisted = persistAssessments();
      if (!persisted.ok) {
        state.assessments[key] = backup;
        const statusEl = $('assessmentStatus');
        statusEl.className = 'status-message is-error';
        statusEl.textContent = persisted.error;
        return;
      }

      state.formDirty = false;
      state.formBuffers.delete(key);
      state.activeFormCandidateId = '';
      renderMeasureRail();
      renderContextBar();
      renderCandidateList();
      if (state.activeUtilityPanel === 'assessments') renderAssessmentsPanel();

      const statusEl = state.selectedCandidateId === c.id ? $('assessmentStatus') : $('workspaceStatus');
      statusEl.className = 'status-message';
      statusEl.textContent = 'Your saved assessment for this measure and page was removed from this device.';
    }

    // Event wiring
    $('measureSearch').addEventListener('input', e => {
      state.measureQuery = e.target.value;
      renderMeasureRail();
    });
    $('readinessFilter').addEventListener('change', e => {
      state.readinessFilter = e.target.value;
      renderMeasureRail();
    });
    $('clearMeasureFilters').addEventListener('click', () => {
      state.measureQuery = '';
      state.readinessFilter = '';
      $('measureSearch').value = '';
      $('readinessFilter').value = '';
      renderMeasureRail();
    });

    $('candidateSearch').addEventListener('input', e => {
      state.candidateQuery = e.target.value;
      renderCandidateList();
    });
    $('screenFilter').addEventListener('change', e => {
      state.screenFilter = e.target.value;
      renderCandidateList();
    });
    $('appFilter').addEventListener('change', e => {
      state.appFilter = e.target.value;
      renderCandidateList();
    });
    $('docTypeFilter').addEventListener('change', e => {
      state.docTypeFilter = e.target.value;
      renderCandidateList();
    });
    $('assessmentFilter').addEventListener('change', e => {
      state.assessmentFilter = e.target.value;
      renderCandidateList();
    });
    $('draftFilter').addEventListener('change', e => {
      state.draftFilter = e.target.value;
      renderCandidateList();
    });
    $('candidateSort').addEventListener('change', e => {
      state.candidateSort = e.target.value;
      renderCandidateList();
    });
    $('clearCandidateFilters').addEventListener('click', clearCandidateFilters);

    $('prevCandidate').addEventListener('click', () => {
      const rows = filteredCandidates();
      const idx = rows.findIndex(c => c.id === state.selectedCandidateId);
      if (idx > 0) selectCandidate(rows[idx - 1].id, true);
    });
    $('nextCandidate').addEventListener('click', () => {
      const rows = filteredCandidates();
      const idx = rows.findIndex(c => c.id === state.selectedCandidateId);
      if (idx >= 0 && idx < rows.length - 1) selectCandidate(rows[idx + 1].id, true);
    });

    $('assessTopic').addEventListener('change', markFormDirty);
    $('assessImpact').addEventListener('change', markFormDirty);
    $('assessNotes').addEventListener('input', markFormDirty);
    $('assessmentForm').addEventListener('submit', saveCurrentAssessment);
    $('clearAssessment').addEventListener('click', clearCurrentAssessment);
    $('discardUnsaved').addEventListener('click', () => {
      const c = state.candidates.find(candidate => candidate.id === state.activeFormCandidateId);
      if (!c) return;
      state.formBuffers.delete(buildAssessmentKey(state.discovery.run_id, c));
      state.formDirty = false;
      renderDetail(filteredCandidates());
    });
    $('loadCompleteText').addEventListener('click', loadCompleteText);
    function changeQueuePage(delta) {
      const rows = filteredCandidates();
      const nextPage = state.queuePage + delta;
      const candidate = rows[nextPage * state.queuePageSize];
      if (candidate) selectCandidate(candidate.id, false);
    }
    $('queuePreviousPage').addEventListener('click', () => changeQueuePage(-1));
    $('queueNextPage').addEventListener('click', () => changeQueuePage(1));

    $('toggleCoverage').addEventListener('click', () => toggleUtilityPanel('coverage', true));
    $('toggleAssessments').addEventListener('click', () => toggleUtilityPanel('assessments', true));
    $('railCoverageLink').addEventListener('click', () => {
      $('measureRail').classList.remove('rail-open');
      $('toggleMeasures').setAttribute('aria-expanded', 'false');
      toggleUtilityPanel('coverage', true);
    });
    $('railAssessmentsLink').addEventListener('click', () => {
      $('measureRail').classList.remove('rail-open');
      $('toggleMeasures').setAttribute('aria-expanded', 'false');
      toggleUtilityPanel('assessments', true);
    });
    $('closeCoverage').addEventListener('click', () => {
      toggleUtilityPanel(null, false);
      $('toggleCoverage').focus();
    });
    $('closeAssessments').addEventListener('click', () => {
      toggleUtilityPanel(null, false);
      $('toggleAssessments').focus();
    });

    $('exportAssessments').addEventListener('click', () => {
      const payload = buildExportPayload();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mwp-discovery-assessments-' + String(state.discovery.run_id || 'run').replace(/[^a-zA-Z0-9_-]+/g, '-') + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const status = $('importExportStatus');
      status.className = 'status-message';
      status.textContent = 'Downloaded ' + payload.records.length + ' device-local assessment' + (payload.records.length === 1 ? '' : 's') + ' as JSON.';
    });

    $('importAssessmentsTrigger').addEventListener('click', () => {
      $('importAssessmentsFile').value = '';
      $('importAssessmentsFile').click();
    });

    $('importAssessmentsFile').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const status = $('importExportStatus');
        try {
          const parsed = JSON.parse(String(reader.result || ''));
          const result = validateAndRestorePayload(parsed);
          status.className = 'status-message' + (result.ok ? '' : ' is-error');
          status.textContent = result.ok ? result.message : result.error;
          if (result.restored > 0) renderAll();
        } catch {
          status.className = 'status-message is-error';
          status.textContent = 'Could not read this file as valid JSON. Choose an assessment JSON file exported from this workspace.';
        }
      };
      reader.onerror = () => {
        const status = $('importExportStatus');
        status.className = 'status-message is-error';
        status.textContent = 'The browser could not read the selected file.';
      };
      reader.readAsText(file);
    });

    $('toggleMeasures').addEventListener('click', () => {
      const open = $('measureRail').classList.toggle('rail-open');
      $('toggleMeasures').setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (state.activeUtilityPanel) {
          const trigger = state.activeUtilityPanel === 'coverage' ? $('toggleCoverage') : $('toggleAssessments');
          toggleUtilityPanel(null, false);
          if (trigger) trigger.focus();
        } else if ($('measureRail').classList.contains('rail-open')) {
          $('measureRail').classList.remove('rail-open');
          $('toggleMeasures').setAttribute('aria-expanded', 'false');
          $('toggleMeasures').focus();
        }
      }
    });
    if (root.addEventListener) root.addEventListener('beforeunload', event => {
      if (state.formBuffers.size || state.unsyncedAssessments) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    populateScopeDropdowns();
    renderAll();

    return {
      state,
      TOPIC_LABELS,
      IMPACT_LABELS,
      normalizeCoverage,
      candidateTextHash,
      candidateTitle,
      buildAssessmentKey,
      buildExportPayload,
      validateAndRestorePayload,
      saveCurrentAssessment,
      clearCurrentAssessment,
      markFormDirty,
      loadCompleteText,
      resolveDraftLink,
      selectMeasure,
      selectCandidate,
      toggleUtilityPanel,
      filteredCandidates,
      renderAll
    };
  }

  root.MWP_DISCOVERY_APP = {
    capturedMarkup,
    TOPIC_LABELS,
    IMPACT_LABELS,
    READINESS_LABELS,
    normalizeCoverage,
    candidateTextHash,
    candidateTitle,
    buildAssessmentKey,
    init: initDiscovery
  };

  if (typeof document !== 'undefined' && document.getElementById('measureRail')) {
    root.MWP_DISCOVERY_INSTANCE = initDiscovery();
  }
})(typeof window === 'undefined' ? globalThis : window);
