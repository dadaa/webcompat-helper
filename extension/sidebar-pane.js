"use strict";

import { UserSettings } from "./user-settings.js";
import { WebCompat } from "./lib/webcompat.js";
import _webCompatData from "./webcompat-data.js";

const _webcompat = new WebCompat(_webCompatData);
const _userSettings = new UserSettings(_webCompatData);
let _targetBrowsers = null;

async function _update() {
  const selectedNode = await browser.experiments.inspectedNode.getNode();
  _updateSelectedNode(selectedNode);
  _updateSubtree(selectedNode);
}

async function _updateSelectedNode(selectedNode) {
  const issueListEl = document.querySelector("#selected ul");

  if (!_isValidElement(selectedNode)) {
    _render([], issueListEl);
    return;
  }

  const issues = [];

  const { attributes, nodeName } = selectedNode;
  issues.push(
    ..._webcompat.getHTMLElementIssues(nodeName, attributes, _targetBrowsers));

  const declarationBlocks = await browser.experiments.inspectedNode.getStyle();
  for (const { declarations } of declarationBlocks) {
    issues.push(
      ..._webcompat.getCSSDeclarationBlockIssues(declarations, _targetBrowsers));
  }

  _render(issues, issueListEl);
}

async function _updateSubtree(selectedNode) {
  const subtreeEl = document.getElementById("subtree");
  const issueListEl = subtreeEl.querySelector("ul");

  if (!_isValidElement(selectedNode)) {
    _render([], issueListEl);
    return;
  }

  const issues = [];

  subtreeEl.classList.add("processing");
  const progressEl = subtreeEl.querySelector("aside label");

  progressEl.textContent = "Getting all descendants of the selected node";
  const nodesInSubtree = await browser.experiments.inspectedNode.getNodesInSubtree();

  progressEl.textContent = "Getting web compatibility issues for HTML element";
  for (const node of nodesInSubtree) {
    if (!_isValidElement(node)) {
      continue
    }

    const { attributes, nodeName } = node;
    issues.push(
      ...
       _webcompat.getHTMLElementIssues(nodeName, attributes, _targetBrowsers)
                 .map(issue => {
                   issue.node = node;
                   return issue;
                 })
    )
  }

  progressEl.textContent = "Getting all descendants of the selected node";
  const declarationBlocks = await browser.experiments.inspectedNode.getStylesInSubtree();

  progressEl.textContent = "Getting web compatibility issues for CSS styles";
  for (const { node, declarations } of declarationBlocks) {
    issues.push(
      ...
       _webcompat.getCSSDeclarationBlockIssues(declarations, _targetBrowsers)
                 .map(issue => {
                   issue.node = node;
                   return issue;
                 })
    )
  }

  progressEl.textContent = "Rendering all issues";
  _render(issues, issueListEl);

  subtreeEl.classList.remove("processing");
}

function _isValidElement({ nodeType, isCustomElement }) {
  return nodeType === Node.ELEMENT_NODE && !isCustomElement;
}

function _render(issues, issueListEl) {
  issueListEl.innerHTML = "";

  if (!issues.length) {
    const noIssueEl = document.createElement("li");
    noIssueEl.textContent = "No issues";
    issueListEl.appendChild(noIssueEl);
  } else {
    for (const issue of issues) {
      issueListEl.appendChild(_renderIssue(issue));
    }
  }
}

function _renderIssue(issue) {
  const issueEl = document.createElement("li");
  const subjectEl = _renderSubject(issue);
  const predicateEl = _renderPredicate(issue);
  issueEl.appendChild(subjectEl);
  issueEl.appendChild(predicateEl);

  issueEl.classList.add((issue.deprecated ? "warning" : "information"));

  return issueEl;
}

function _renderSubject(issue) {
  const { type, url } = issue;
  const subjectEl = document.createElement("span");

  switch (type) {
    case WebCompat.ISSUE_TYPE.CSS_PROPERTY: {
      subjectEl.append(
        _renderTerm(issue.property, ["property", "issue"], url)
      );
      break;
    }
    case WebCompat.ISSUE_TYPE.CSS_PROPERTY_ALIASES: {
      subjectEl.append(
        _renderTerms(issue.aliases, ["property", "alias", "issue"], url),
        _renderTerm(` ${ issue.aliases.length === 1 ? "alias" : "aliases" }`)
      );
      break;
    }
    case WebCompat.ISSUE_TYPE.CSS_VALUE: {
      subjectEl.append(
        _renderTerm(`${issue.property}: `),
        _renderTerm(issue.value, ["value", "issue"], url)
      );
      break;
    }
    case WebCompat.ISSUE_TYPE.CSS_VALUE_ALIASES: {
      subjectEl.append(
        _renderTerm(`${issue.property}: `),
        _renderTerms(issue.aliases, ["value", "alias", "issue"], url),
        _renderTerm(` ${ issue.aliases.length === 1 ? "alias" : "aliases" }`)
      );
      break;
    }
    case WebCompat.ISSUE_TYPE.HTML_ATTRIBUTE: {
      subjectEl.append(
        _renderTerm(issue.element.toLowerCase(), ["element"]),
        _renderTerm(" "),
        _renderTerm(issue.attribute.toLowerCase(), ["attribute", "issue"], url),
        _renderTerm(" attribute"),
      );
      break;
    }
    case WebCompat.ISSUE_TYPE.HTML_ELEMENT: {
      subjectEl.append(
        _renderTerm(issue.element.toLowerCase(), ["element", "issue"], url)
      );
      break;
    }
  }

  return subjectEl;
}

function _renderPredicate(issue) {
  const { type, aliases, unsupportedBrowsers } = issue;
  const predicateEl = document.createElement("span");

  const warningEl = _renderWarning(issue);
  if (warningEl) {
    predicateEl.appendChild(warningEl);
  }

  if (unsupportedBrowsers.length) {
    if (warningEl) {
      predicateEl.appendChild(_renderTerm(" and "));
    }

    const auxiliaryVerb = !aliases || aliases.length === 1 ? "does" : "do";
    predicateEl.appendChild(_renderTerm(` ${ auxiliaryVerb } not support`));
    predicateEl.appendChild(_renderBrowsersElement(unsupportedBrowsers));
  }

  predicateEl.appendChild(_renderTerm("."));
  return predicateEl;
}

function _renderWarning(issue) {
  const { type, aliases, deprecated, experimental } = issue;

  if (!deprecated && !experimental) {
    return null;
  }

  const warningEl = document.createElement("span");

  const connection = !aliases || aliases.length === 1 ? " is " : " are ";
  warningEl.appendChild(_renderTerm(connection));

  if (deprecated) {
    const deprecatedEl = _renderTerm("deprecated");
    deprecatedEl.classList.add("deprecated");
    warningEl.appendChild(deprecatedEl);
  }

  if (experimental) {
    const experimentalEl = _renderTerm("experimental");
    experimentalEl.classList.add("experimental");

    if (deprecated) {
      warningEl.appendChild(_renderTerm(" and "));
    }

    warningEl.appendChild(experimentalEl);
  }

  return warningEl;
}

function _renderBrowsersElement(browsers) {
  const browsersEl = document.createElement("span");

  const map = {};
  for (const { id, name, status } of browsers) {
    if (!map[id]) {
      map[id] = { name, versions: [] };
    }
    map[id].versions.push(status);
  }

  for (let id in map) {
    const { name, versions } = map[id];
    const browserEl = _renderTerm(name);
    browserEl.classList.add("browser");
    browserEl.classList.add(id);

    const versionsEl = document.createElement("span");
    versionsEl.classList.add("versions");

    for (const version of versions) {
      const versionEl = _renderTerm(version);
      versionEl.classList.add("version");
      versionsEl.appendChild(versionEl);
    }

    browserEl.appendChild(versionsEl);
    browsersEl.appendChild(browserEl);
  }

  return browsersEl;
}

function _renderTerms(terms, classes, url) {
  const containerEl = document.createElement("span");

  for (const term of terms) {
    const termEl = _renderTerm(term, classes, url);
    containerEl.appendChild(termEl);
  }

  return containerEl;
}

function _renderTerm(text, classes = [], url = null) {
  const tagName = url ? "a" : "span";
  const termEl = document.createElement(tagName);
  termEl.classList.add(...classes);
  termEl.textContent = text;

  if (url) {
    termEl.href = url;
    termEl.title = url;
    termEl.addEventListener("click", _onClickLink);
  }

  return termEl;
}

function _onClickLink(e) {
  e.stopPropagation();
  e.preventDefault();
  browser.tabs.create({ url: e.target.href });
}

async function _updateCSSValueEnabled() {
  const isCSSValueEnabled = await _userSettings.isCSSValueEnabled();
  _webcompat.setCSSValueEnabled(isCSSValueEnabled);
}

async function _updateTargetBrowsers() {
  _targetBrowsers = await _userSettings.getTargetBrowsers();
}

browser.experiments.inspectedNode.onChange.addListener(_update);

_userSettings.addChangeListener(UserSettings.SETTING_TYPE.TARGET_BROWSER, async () => {
  await _updateTargetBrowsers();
  await _update();
});

_userSettings.addChangeListener(UserSettings.SETTING_TYPE.CSS_VALUE_ENABLED, async () => {
  await _updateCSSValueEnabled();
  await _update();
});

(async function initialize() {
  await _updateCSSValueEnabled();
  await _updateTargetBrowsers();
  await _update();
})();
