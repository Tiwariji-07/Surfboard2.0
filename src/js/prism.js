/* PrismJS - Lightweight syntax highlighting */
(function() {
    var Prism = {
        languages: {},
        highlight: function(text, grammar, language) {
            return this.tokenize(text, grammar)
                .map(token => typeof token === 'string' ? token : this.wrapToken(token))
                .join('');
        },
        tokenize: function(text, grammar) {
            var tokens = [];
            var rest = text;
            var match, token;

            for (var tokenName in grammar) {
                if (!grammar.hasOwnProperty(tokenName)) continue;

                var pattern = grammar[tokenName];
                pattern = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

                match = pattern.exec(rest);
                if (match && match.index === 0) {
                    token = {
                        type: tokenName,
                        content: match[0]
                    };
                    rest = rest.slice(match[0].length);
                    tokens.push(token);
                    break;
                }
            }

            if (rest) tokens.push(rest);
            return tokens;
        },
        wrapToken: function(token) {
            return '<span class="token ' + token.type + '">' + token.content + '</span>';
        }
    };

    // Define language grammars
    Prism.languages.javascript = {
        'comment': /\/\/.*|\/\*[\s\S]*?\*\//,
        'string': /(["'])(\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
        'keyword': /\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
        'boolean': /\b(?:true|false)\b/,
        'number': /\b0x[\da-f]+\b|(?:\b\d+\.?\d*|\B\.\d+)(?:e[+-]?\d+)?/i,
        'operator': /[-+*/%]|&&|\|\||[<>]=?|[!=]=?=?/,
        'punctuation': /[{}[\];(),.:]/,
        'function': /\b\w+(?=\()/
    };

    Prism.languages.python = {
        'comment': /#.*/,
        'string': {
            pattern: /(?:[rub]|rb|br)?"""[\s\S]*?"""|'''[\s\S]*?'''|["'](?:\\.|[^\\])*["']/i,
            greedy: true
        },
        'keyword': /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|print|raise|return|try|while|with|yield)\b/,
        'builtin': /\b(?:__import__|abs|all|any|apply|ascii|basestring|bin|bool|buffer|bytearray|bytes|callable|chr|classmethod|cmp|coerce|compile|complex|delattr|dict|dir|divmod|enumerate|eval|execfile|file|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|intern|isinstance|issubclass|iter|len|list|locals|long|map|max|memoryview|min|next|object|oct|open|ord|pow|property|range|raw_input|reduce|reload|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|unichr|unicode|vars|xrange|zip)\b/,
        'boolean': /\b(?:True|False|None)\b/,
        'number': /\b0x[\da-f]+|\b\d+\.?\d*(?:e[+-]?\d+)?j?\b/i,
        'operator': /[-+%=]=?|!=|:=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]|\b(?:or|and|not)\b/,
        'punctuation': /[{}[\];(),.:]/
    };

    Prism.languages.html = {
        'comment': /<!--[\s\S]*?-->/,
        'prolog': /<\?[\s\S]+?\?>/,
        'doctype': /<!DOCTYPE[\s\S]+?>/i,
        'cdata': /<!\[CDATA\[[\s\S]*?]]>/i,
        'tag': {
            pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
            inside: {
                'tag': {
                    pattern: /^<\/?[^\s>\/]+/,
                    inside: {
                        'punctuation': /^<\/?/,
                        'namespace': /^[^\s>\/:]+:/
                    }
                },
                'attr-value': {
                    pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
                    inside: {
                        'punctuation': [/^=/, {
                            pattern: /^(\s*)["']|["']$/,
                            lookbehind: true
                        }]
                    }
                },
                'punctuation': /\/?>/,
                'attr-name': {
                    pattern: /[^\s>\/]+/
                }
            }
        },
        'entity': /&[\da-z]{1,8};/i
    };

    Prism.languages.css = {
        'comment': /\/\*[\s\S]*?\*\//,
        'atrule': {
            pattern: /@[\w-]+[\s\S]*?(?:;|(?=\s*\{))/,
            inside: {
                'rule': /@[\w-]+/
            }
        },
        'url': /url\((?:(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1|.*?)\)/i,
        'selector': /[^{}\s][^{};]*?(?=\s*\{)/,
        'string': /("|')(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
        'property': /[-_a-z\xA0-\uFFFF][-\w\xA0-\uFFFF]*(?=\s*:)/i,
        'important': /\B!important\b/i,
        'function': /[-a-z0-9]+(?=\()/i,
        'punctuation': /[(){};:,]/
    };

    // Make Prism available globally
    window.Prism = Prism;
})();
