// Upper-case labels would turn η into "H" and λ into "Λ". Wrap lower-case Greek letters so CSS
// text-transform leaves them alone (class .gk). KaTeX output and SVG are skipped.
const GREEK = /[\u03b1-\u03c9]/;

export function protectGreek(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (GREEK.test(n.nodeValue) && !n.parentElement.closest(".katex, svg, script, style, .gk")
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/([\u03b1-\u03c9]+)/).forEach((part, i) => {
      if (!part) return;
      if (i % 2) { const s = document.createElement("span"); s.className = "gk"; s.textContent = part; frag.appendChild(s); }
      else frag.appendChild(document.createTextNode(part));
    });
    n.replaceWith(frag);
  });
}
