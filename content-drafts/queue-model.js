'use strict';
(function (root) {
  const labels = {
    content_review: 'Draft to review',
    policy_evidence: 'Awaiting policy evidence',
    connected: 'Connected review',
    no_change: 'No change identified',
    excluded: 'Outside scope'
  };
  const order = Object.keys(labels);
  function group(page) {
    if (page.reviewGroup) return page.reviewGroup;
    if (page.editorialReview && page.editorialReview.outOfScope) return 'excluded';
    if (page.releaseStatus === 'blocked' || page.releaseBasis) return 'policy_evidence';
    if (page.sections.some(s => s.before !== s.after)) return 'content_review';
    return page.triage && page.triage.reviewedRoute !== 'no_change' ? 'connected' : 'no_change';
  }
  function select(pages, {query = '', topic = '', decision = '', sort = 'review'} = {}) {
    const needle = query.trim().toLowerCase();
    const result = pages.map((page, index) => ({page, index})).filter(({page}) => {
      const topics = page.topics || [];
      return (!topic || (topic === 'other' ? topics.length === 0 : topics.includes(topic))) &&
        (!decision || group(page) === decision) &&
        [page.title, page.decision, page.measure, ...topics].join(' ').toLowerCase().includes(needle);
    });
    return result.sort((a, b) => {
      if (sort === 'newest') return b.index - a.index;
      if (sort === 'review') {
        const difference = order.indexOf(group(a.page)) - order.indexOf(group(b.page));
        if (difference) return difference;
      }
      return a.page.title.localeCompare(b.page.title, 'en-GB') || a.index - b.index;
    }).map(row => row.index);
  }
  const api = {labels, group, select};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DraftQueue = api;
})(typeof window === 'undefined' ? globalThis : window);
