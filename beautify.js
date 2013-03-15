/*jslint onevar: false, plusplus: false */
/*jshint curly:true, eqeqeq:true, laxbreak:true, noempty:false */
/*

 JS Beautifier
---------------


  Written by Einar Lielmanis, <einar@jsbeautifier.org>
      http://jsbeautifier.org/

  Originally converted to javascript by Vital, <vital76@gmail.com>
  "End braces on own line" added by Chris J. Shull, <chrisjshull@gmail.com>

  You are free to use this in any way you want, in case you find this useful or working for you.

  Usage:
    js_beautify(js_source_text);
    js_beautify(js_source_text, options);

  The options are:
    indent_size (default 4)          - indentation size,
    indent_char (default space)      - character to indent with,
    preserve_newlines (default true) - whether existing line breaks should be preserved,
    max_preserve_newlines (default unlimited) - maximum number of line breaks to be preserved in one chunk,

    jslint_happy (default false) - if true, then jslint-stricter mode is enforced.

            jslint_happy   !jslint_happy
            ---------------------------------
             function ()      function()

    brace_style (default "collapse") - "collapse" | "expand" | "end-expand" | "expand-strict"
            put braces on the same line as control statements (default), or put braces on own line (Allman / ANSI style), or just put end braces on own line.

            expand-strict: put brace on own line even in such cases:

                var a =
                {
                    a: 5,
                    b: 6
                }
            This mode may break your scripts - e.g "return { a: 1 }" will be broken into two lines, so beware.

    space_before_conditional (default true) - should the space before conditional statement be added, "if(true)" vs "if (true)",

    unescape_strings (default false) - should printable characters in strings encoded in \xNN notation be unescaped, "example" vs "\x65\x78\x61\x6d\x70\x6c\x65"

    wrap_line_length (default unlimited) - lines should wrap at next opportunity after this number of characters.
          NOTE: This is not a hard limit. Lines will continue until a point where a newline would
                be preserved if it were present.

    e.g

    js_beautify(js_source_text, {
      'indent_size': 1,
      'indent_char': '\t'
    });

*/



function js_beautify(js_source_text, options) {

    var input, output, token_text, last_type, last_text, last_last_text, last_word, flags, flag_store, indent_string;
    var whitespace, wordchar, punct, parser_pos, line_starters, digits;
    var prefix, token_type;
    var wanted_newline, n_newlines, output_wrapped, output_space_before_token;
    var preindent_string = '';


    // Some interpreters have unexpected results with foo = baz || bar;
    options = options ? options : {};

    var opt_brace_style;

    // compatibility
    if (options.space_after_anon_function !== undefined && options.jslint_happy === undefined) {
        options.jslint_happy = options.space_after_anon_function;
    }
    if (options.braces_on_own_line !== undefined) { //graceful handling of deprecated option
        opt_brace_style = options.braces_on_own_line ? "expand" : "collapse";
    }
    opt_brace_style = options.brace_style ? options.brace_style : (opt_brace_style ? opt_brace_style : "collapse");

    var opt_indent_size = options.indent_size ? parseInt(options.indent_size) : 4,
        opt_indent_char = options.indent_char ? options.indent_char : ' ',
        opt_preserve_newlines = typeof options.preserve_newlines === 'undefined' ? true : options.preserve_newlines,
        opt_break_chained_methods = typeof options.break_chained_methods === 'undefined' ? false : options.break_chained_methods,
        opt_max_preserve_newlines = typeof options.max_preserve_newlines === 'undefined' ? 0 : parseInt(options.max_preserve_newlines),
        opt_jslint_happy = options.jslint_happy === 'undefined' ? false : options.jslint_happy,
        opt_keep_array_indentation = typeof options.keep_array_indentation === 'undefined' ? false : options.keep_array_indentation,
        opt_space_before_conditional = typeof options.space_before_conditional === 'undefined' ? true : options.space_before_conditional,
        opt_unescape_strings = typeof options.unescape_strings === 'undefined' ? false : options.unescape_strings,
        opt_wrap_line_length = typeof options.wrap_line_length === 'undefined' ? 0 : parseInt(options.wrap_line_length);

    // cache the source's length.
    var input_length = js_source_text.length;

    function trim_output(eat_newlines) {
        eat_newlines = typeof eat_newlines === 'undefined' ? false : eat_newlines;
        while (output.length && (output[output.length - 1] === ' '
            || output[output.length - 1] === indent_string
            || output[output.length - 1] === preindent_string
            || (eat_newlines && (output[output.length - 1] === '\n' || output[output.length - 1] === '\r')))) {
            output.pop();
        }
    }

    function trim(s) {
        return s.replace(/^\s\s*|\s\s*$/, '');
    }

    // we could use just string.split, but
    // IE doesn't like returning empty strings
    function split_newlines(s) {
        //return s.split(/\x0d\x0a|\x0a/);

        s = s.replace(/\x0d/g, '');
        var out = [],
            idx = s.indexOf("\n");
        while (idx !== -1) {
            out.push(s.substring(0, idx));
            s = s.substring(idx + 1);
            idx = s.indexOf("\n");
        }
        if (s.length) {
            out.push(s);
        }
        return out;
    }

    function just_added_newline() {
        return output[output.length - 1] === "\n";
    }

    function _last_index_of(arr, find) {
        var i = arr.length - 1;
        if (i < 0) i += arr.length;
        if (i > arr.length - 1) {
            i = arr.length - 1;
        }
        for (i++; i-- > 0;) {
            if (i in arr && arr[i]===find) return i;
        }
        return -1;
    }
    function allow_wrap_or_preserved_newline(force_linewrap) {
        force_linewrap = typeof force_linewrap === 'undefined' ? false : force_linewrap;
        if (opt_wrap_line_length && !force_linewrap) {
            var current_line = '';
            var proposed_line_length = 0;
            var start_line = _last_index_of(output, '\n') + 1;
            // never wrap the first token of a line.
            if(start_line < output.length) {
                current_line = output.slice(start_line).join('');
                proposed_line_length = current_line.length + token_text.length +
                   (output_space_before_token ? 1 : 0);
                if(proposed_line_length >= opt_wrap_line_length) {
                    force_linewrap = true;
                }
            }
        }
        if(((opt_preserve_newlines && wanted_newline) || force_linewrap) && !just_added_newline()) {
            print_newline(false, true);
            output_wrapped = true;
            wanted_newline = false;
        }
    }

    function print_newline(force_newline, preserve_statement_flags) {
        output_wrapped = false;
        output_space_before_token = false;

        if (!preserve_statement_flags) {
            if(last_text !== ';') {
                while (flags.mode === 'STATEMENT' && !flags.if_block) {
                    restore_mode();
                }
            }
        }

        if (!output.length) {
            return; // no newline on start of file
        }

        if (force_newline || !just_added_newline()) {
            output.push("\n");
        }
    }

    function print_line_indentation() {
        if(just_added_newline()) {
            if (opt_keep_array_indentation && is_array(flags.mode) && flags.whitespace_before.length) {
                output.push(flags.whitespace_before.join('') + '');
            } else {
                if (preindent_string) {
                    output.push(preindent_string);
                }

                print_indent_string(flags.indentation_level);
                print_indent_string(flags.var_line && flags.var_line_reindented);
                print_indent_string(output_wrapped);
            }
        }
    }

    function print_indent_string(level) {
        if (level === undefined) {
            level = 1;
        } else if (typeof level !== 'number') {
            level = level ? 1 : 0;
        }

        // Never indent your first output indent at the start of the file
        if(last_text != '') {
            for (var i = 0; i < level; i += 1) {
                output.push(indent_string);
            }
        }
    }

    function print_single_space() {

        var last_output = ' ';

        if (output.length) {
            last_output = output[output.length - 1];
        }
        if (!just_added_newline() && last_output !== ' ' && last_output !== indent_string) { // prevent occassional duplicate space
            output.push(' ');
        }
    }


    function print_token(printable_token) {
        printable_token = printable_token || token_text;
        print_line_indentation();
        output_wrapped = false;
        if (output_space_before_token) {
            print_single_space();
            output_space_before_token = false;
        }
        output.push(printable_token);
    }

    function indent() {
        flags.indentation_level += 1;
    }

    function set_mode(mode) {
        if (flags) {
            flag_store.push(flags);
        }
        flags = {
            previous_mode: flags ? flags.mode : 'BLOCK',
            mode: mode,
            var_line: false,
            var_line_tainted: false,
            var_line_reindented: false,
            in_html_comment: false,
            if_block: false,
            do_block: false,
            do_while: false,
            in_case_statement: false, // switch(..){ INSIDE HERE }
            in_case: false, // we're on the exact line with "case 0:"
            case_body: false, // the indented case-action block
            indentation_level: (flags ? flags.indentation_level + ((flags.var_line && flags.var_line_reindented) ? 1 : 0) : 0),
            ternary_depth: 0
        };
    }

    function is_array(mode) {
        return mode === '[EXPRESSION]' || mode === '[INDENTED-EXPRESSION]';
    }

    function is_expression(mode) {
        return in_array(mode, ['[EXPRESSION]', '(EXPRESSION)', '(FOR-EXPRESSION)', '(COND-EXPRESSION)']);
    }

    function restore_mode() {
        if (flag_store.length > 0) {
            var mode = flags.mode;
            flags = flag_store.pop();
            flags.previous_mode = mode;
        }
    }

    function start_of_statement() {
        if (
            (last_text === 'do' ||
            (last_text === 'else' && token_text !== 'if' ) ||
            (last_type === 'TK_END_EXPR' && (flags.previous_mode === '(FOR-EXPRESSION)' || flags.previous_mode === '(COND-EXPRESSION)')))
            ) {
            allow_wrap_or_preserved_newline();
            set_mode('STATEMENT');
            indent();
            output_wrapped = false;
            return true;
        }
        return false;
    }

    function all_lines_start_with(lines, c) {
        for (var i = 0; i < lines.length; i++) {
            var line = trim(lines[i]);
            if (line.charAt(0) !== c) {
                return false;
            }
        }
        return true;
    }

    function is_special_word(word) {
        return in_array(word, ['case', 'return', 'do', 'if', 'throw', 'else']);
    }

    function in_array(what, arr) {
        for (var i = 0; i < arr.length; i += 1) {
            if (arr[i] === what) {
                return true;
            }
        }
        return false;
    }

    function unescape_string(s) {
        var esc = false,
            out = '',
            pos = 0,
            s_hex = '',
            escaped = 0,
            c;

        while (esc || pos < s.length) {

            c = s.charAt(pos);
            pos++;

            if (esc) {
                esc = false;
                if (c === 'x') {
                    // simple hex-escape \x24
                    s_hex = s.substr(pos, 2);
                    pos += 2;
                } else if (c === 'u') {
                    // unicode-escape, \u2134
                    s_hex = s.substr(pos, 4);
                    pos += 4;
                } else {
                    // some common escape, e.g \n
                    out += '\\' + c;
                    continue;
                }
                if ( ! s_hex.match(/^[0123456789abcdefABCDEF]+$/)) {
                    // some weird escaping, bail out,
                    // leaving whole string intact
                    return s;
                }

                escaped = parseInt(s_hex, 16);

                if (escaped >= 0x00 && escaped < 0x20) {
                    // leave 0x00...0x1f escaped
                    if (c === 'x') {
                        out += '\\x' + s_hex;
                    } else {
                        out += '\\u' + s_hex;
                    }
                    continue;
                } else if (escaped == 0x22 || escaped === 0x27 || escaped == 0x5c) {
                    // single-quote, apostrophe, backslash - escape these
                    out += '\\' + String.fromCharCode(escaped);
                } else if (c === 'x' && escaped > 0x7e && escaped <= 0xff) {
                    // we bail out on \x7f..\xff,
                    // leaving whole string escaped,
                    // as it's probably completely binary
                    return s;
                } else {
                    out += String.fromCharCode(escaped);
                }
            } else if (c == '\\') {
                esc = true;
            } else {
                out += c;
            }
        }
        return out;
    }

    function look_up(exclude) {
        var local_pos = parser_pos;
        var c = input.charAt(local_pos);
        while (in_array(c, whitespace) && c !== exclude) {
            local_pos++;
            if (local_pos >= input_length) {
                return 0;
            }
            c = input.charAt(local_pos);
        }
        return c;
    }

    function get_next_token() {
        var i;

        n_newlines = 0;

        if (parser_pos >= input_length) {
            return ['', 'TK_EOF'];
        }

        wanted_newline = false;
        flags.whitespace_before = [];

        var c = input.charAt(parser_pos);
        parser_pos += 1;

        while (in_array(c, whitespace)) {

            if (c === "\n") {
                n_newlines += 1;
                flags.whitespace_before = [];
            } else if (n_newlines){
                if (c === indent_string) {
                    flags.whitespace_before.push(indent_string);
                } else if (c !== '\r') {
                    flags.whitespace_before.push(' ');
                }
            }

            if (parser_pos >= input_length) {
                return ['', 'TK_EOF'];
            }

            c = input.charAt(parser_pos);
            parser_pos += 1;
        }

        if (in_array(c, wordchar)) {
            if (parser_pos < input_length) {
                while (in_array(input.charAt(parser_pos), wordchar)) {
                    c += input.charAt(parser_pos);
                    parser_pos += 1;
                    if (parser_pos === input_length) {
                        break;
                    }
                }
            }

            // small and surprisingly unugly hack for 1E-10 representation
            if (parser_pos !== input_length && c.match(/^[0-9]+[Ee]$/) && (input.charAt(parser_pos) === '-' || input.charAt(parser_pos) === '+')) {

                var sign = input.charAt(parser_pos);
                parser_pos += 1;

                var t = get_next_token();
                c += sign + t[0];
                return [c, 'TK_WORD'];
            }

            if (c === 'in') { // hack for 'in' operator
                return [c, 'TK_OPERATOR'];
            }
            return [c, 'TK_WORD'];
        }

        if (c === '(' || c === '[') {
            return [c, 'TK_START_EXPR'];
        }

        if (c === ')' || c === ']') {
            return [c, 'TK_END_EXPR'];
        }

        if (c === '{') {
            return [c, 'TK_START_BLOCK'];
        }

        if (c === '}') {
            return [c, 'TK_END_BLOCK'];
        }

        if (c === ';') {
            return [c, 'TK_SEMICOLON'];
        }

        if (c === '/') {
            var comment = '';
            // peek for comment /* ... */
            var inline_comment = true;
            if (input.charAt(parser_pos) === '*') {
                parser_pos += 1;
                if (parser_pos < input_length) {
                    while (parser_pos < input_length &&
                        ! (input.charAt(parser_pos) === '*' && input.charAt(parser_pos + 1) && input.charAt(parser_pos + 1) === '/')) {
                        c = input.charAt(parser_pos);
                        comment += c;
                        if (c === "\n" || c === "\r") {
                            inline_comment = false;
                        }
                        parser_pos += 1;
                        if (parser_pos >= input_length) {
                            break;
                        }
                    }
                }
                parser_pos += 2;
                if (inline_comment && n_newlines === 0) {
                    return ['/*' + comment + '*/', 'TK_INLINE_COMMENT'];
                } else {
                    return ['/*' + comment + '*/', 'TK_BLOCK_COMMENT'];
                }
            }
            // peek for comment // ...
            if (input.charAt(parser_pos) === '/') {
                comment = c;
                while (input.charAt(parser_pos) !== '\r' && input.charAt(parser_pos) !== '\n') {
                    comment += input.charAt(parser_pos);
                    parser_pos += 1;
                    if (parser_pos >= input_length) {
                        break;
                    }
                }
                return [comment, 'TK_COMMENT'];
            }

        }

        if (c === "'" || // string
        c === '"' || // string
        (c === '/' &&
            ((last_type === 'TK_WORD' && is_special_word(last_text)) ||
                (last_text === ')' && in_array(flags.previous_mode, ['(COND-EXPRESSION)', '(FOR-EXPRESSION)'])) ||
                (last_type === 'TK_COMMA' || last_type === 'TK_COMMENT' || last_type === 'TK_START_EXPR' || last_type === 'TK_START_BLOCK' || last_type === 'TK_END_BLOCK' || last_type === 'TK_OPERATOR' || last_type === 'TK_EQUALS' || last_type === 'TK_EOF' || last_type === 'TK_SEMICOLON')))) { // regexp
            var sep = c,
                esc = false,
                has_char_escapes = false,
                resulting_string = c;

            if (parser_pos < input_length) {
                if (sep === '/') {
                    //
                    // handle regexp separately...
                    //
                    var in_char_class = false;
                    while (esc || in_char_class || input.charAt(parser_pos) !== sep) {
                        resulting_string += input.charAt(parser_pos);
                        if (!esc) {
                            esc = input.charAt(parser_pos) === '\\';
                            if (input.charAt(parser_pos) === '[') {
                                in_char_class = true;
                            } else if (input.charAt(parser_pos) === ']') {
                                in_char_class = false;
                            }
                        } else {
                            esc = false;
                        }
                        parser_pos += 1;
                        if (parser_pos >= input_length) {
                            // incomplete string/rexp when end-of-file reached.
                            // bail out with what had been received so far.
                            return [resulting_string, 'TK_STRING'];
                        }
                    }

                } else {
                    //
                    // and handle string also separately
                    //
                    while (esc || input.charAt(parser_pos) !== sep) {
                        resulting_string += input.charAt(parser_pos);
                        if (esc) {
                            if (input.charAt(parser_pos) === 'x' || input.charAt(parser_pos) === 'u') {
                                has_char_escapes = true;
                            }
                            esc = false;
                        } else {
                            esc = input.charAt(parser_pos) === '\\';
                        }
                        parser_pos += 1;
                        if (parser_pos >= input_length) {
                            // incomplete string/rexp when end-of-file reached.
                            // bail out with what had been received so far.
                            return [resulting_string, 'TK_STRING'];
                        }
                    }

                }
            }

            parser_pos += 1;
            resulting_string += sep;

            if (has_char_escapes && opt_unescape_strings) {
                resulting_string = unescape_string(resulting_string);
            }

            if (sep === '/') {
                // regexps may have modifiers /regexp/MOD , so fetch those, too
                while (parser_pos < input_length && in_array(input.charAt(parser_pos), wordchar)) {
                    resulting_string += input.charAt(parser_pos);
                    parser_pos += 1;
                }
            }
            return [resulting_string, 'TK_STRING'];
        }

        if (c === '#') {


            if (output.length === 0 && input.charAt(parser_pos) === '!') {
                // shebang
                resulting_string = c;
                while (parser_pos < input_length && c !== '\n') {
                    c = input.charAt(parser_pos);
                    resulting_string += c;
                    parser_pos += 1;
                }
                return [trim(resulting_string) + '\n', 'TK_UNKNOWN'];
            }



            // Spidermonkey-specific sharp variables for circular references
            // https://developer.mozilla.org/En/Sharp_variables_in_JavaScript
            // http://mxr.mozilla.org/mozilla-central/source/js/src/jsscan.cpp around line 1935
            var sharp = '#';
            if (parser_pos < input_length && in_array(input.charAt(parser_pos), digits)) {
                do {
                    c = input.charAt(parser_pos);
                    sharp += c;
                    parser_pos += 1;
                } while (parser_pos < input_length && c !== '#' && c !== '=');
                if (c === '#') {
                    //
                } else if (input.charAt(parser_pos) === '[' && input.charAt(parser_pos + 1) === ']') {
                    sharp += '[]';
                    parser_pos += 2;
                } else if (input.charAt(parser_pos) === '{' && input.charAt(parser_pos + 1) === '}') {
                    sharp += '{}';
                    parser_pos += 2;
                }
                return [sharp, 'TK_WORD'];
            }
        }

        if (c === '<' && input.substring(parser_pos - 1, parser_pos + 3) === '<!--') {
            parser_pos += 3;
            c = '<!--';
            while (input.charAt(parser_pos) !== '\n' && parser_pos < input_length) {
                c += input.charAt(parser_pos);
                parser_pos++;
            }
            flags.in_html_comment = true;
            return [c, 'TK_COMMENT'];
        }

        if (c === '-' && flags.in_html_comment && input.substring(parser_pos - 1, parser_pos + 2) === '-->') {
            flags.in_html_comment = false;
            parser_pos += 2;
            return ['-->', 'TK_COMMENT'];
        }

        if (c === '.') {
            return [c, 'TK_DOT'];
        }

        if (in_array(c, punct)) {
            while (parser_pos < input_length && in_array(c + input.charAt(parser_pos), punct)) {
                c += input.charAt(parser_pos);
                parser_pos += 1;
                if (parser_pos >= input_length) {
                    break;
                }
            }

            if (c === ',') {
                return [c, 'TK_COMMA'];
            } else if (c === '=') {
                return [c, 'TK_EQUALS'];
            } else {
                return [c, 'TK_OPERATOR'];
            }
        }

        return [c, 'TK_UNKNOWN'];
    }

    //----------------------------------
    indent_string = '';
    while (opt_indent_size > 0) {
        indent_string += opt_indent_char;
        opt_indent_size -= 1;
    }

    while (js_source_text && (js_source_text.charAt(0) === ' ' || js_source_text.charAt(0) === '\t')) {
        preindent_string += js_source_text.charAt(0);
        js_source_text = js_source_text.substring(1);
    }
    input = js_source_text;

    last_word = ''; // last 'TK_WORD' passed
    last_type = 'TK_START_EXPR'; // last token type
    last_text = ''; // last token text
    last_last_text = ''; // pre-last token text
    output = [];
    output_wrapped = false;
    output_space_before_token = false;

    whitespace = "\n\r\t ".split('');
    wordchar = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'.split('');
    digits = '0123456789'.split('');

    punct = '+ - * / % & ++ -- = += -= *= /= %= == === != !== > < >= <= >> << >>> >>>= >>= <<= && &= | || ! !! , : ? ^ ^= |= ::';
    punct += ' <%= <% %> <?= <? ?>'; // try to be a good boy and try not to break the markup language identifiers
    punct = punct.split(' ');

    // words which should always start on new line.
    line_starters = 'continue,try,throw,return,var,if,switch,case,default,for,while,break,function'.split(',');

    // states showing if we are currently in expression (i.e. "if" case) - 'EXPRESSION', or in usual block (like, procedure), 'BLOCK'.
    // some formatting depends on that.
    flag_store = [];
    set_mode('BLOCK');

    parser_pos = 0;
    while (true) {
        var t = get_next_token();
        token_text = t[0];
        token_type = t[1];

        if (token_type === 'TK_EOF') {
            break;
        }

        var keep_whitespace = opt_keep_array_indentation && is_array(flags.mode);

        if(keep_whitespace) {
            for (i = 0; i < n_newlines; i += 1) {
                print_newline(true);
            }
        } else {
            wanted_newline = n_newlines > 0;
            if (opt_max_preserve_newlines && n_newlines > opt_max_preserve_newlines) {
                n_newlines = opt_max_preserve_newlines;
            }

            if (opt_preserve_newlines) {
                if( n_newlines > 1) {
                    print_newline();
                    for (i = 1; i < n_newlines; i += 1) {
                        print_newline(true);
                    }
                }
            }
        }

        switch (token_type) {

        case 'TK_START_EXPR':
            if (start_of_statement()) {
                // The conditional starts the statement if appropriate.
            }

            if (token_text === '[') {

                if (last_type === 'TK_WORD' || last_text === ')') {
                    // this is array index specifier, break immediately
                    // a[x], fn()[x]
                    if (in_array(last_text, line_starters)) {
                        output_space_before_token = true;
                    }
                    set_mode('(EXPRESSION)');
                    print_token();
                    break;
                }

                if (flags.mode === '[EXPRESSION]' || flags.mode === '[INDENTED-EXPRESSION]') {
                    if (last_last_text === ']' && last_text === ',') {
                        // ], [ goes to new line
                        if (flags.mode === '[EXPRESSION]') {
                            flags.mode = '[INDENTED-EXPRESSION]';
                            if (!opt_keep_array_indentation) {
                                indent();
                            }
                        }
                        set_mode('[EXPRESSION]');
                        if (!opt_keep_array_indentation) {
                            print_newline();
                        }
                    } else if (last_text === '[') {
                        if (flags.mode === '[EXPRESSION]') {
                            flags.mode = '[INDENTED-EXPRESSION]';
                            if (!opt_keep_array_indentation) {
                                indent();
                            }
                        }
                        set_mode('[EXPRESSION]');

                        if (!opt_keep_array_indentation) {
                            print_newline();
                        }
                    } else {
                        set_mode('[EXPRESSION]');
                    }
                } else {
                    set_mode('[EXPRESSION]');
                }

            } else {
                if (last_text === 'for') {
                    set_mode('(FOR-EXPRESSION)');
                } else if (in_array(last_text, ['if', 'while'])) {
                    set_mode('(COND-EXPRESSION)');
                } else {
                    set_mode('(EXPRESSION)');
                }
            }

            if (last_text === ';' || last_type === 'TK_START_BLOCK') {
                print_newline();
            } else if (last_type === 'TK_END_EXPR' || last_type === 'TK_START_EXPR' || last_type === 'TK_END_BLOCK' || last_text === '.') {
                if (wanted_newline) {
                    print_newline();
                }
                // do nothing on (( and )( and ][ and ]( and .(
            } else if (last_type !== 'TK_WORD' && last_type !== 'TK_OPERATOR') {
                output_space_before_token = true;
            } else if (last_word === 'function' || last_word === 'typeof') {
                // function() vs function ()
                if (opt_jslint_happy) {
                    output_space_before_token = true;
                }
            } else if (in_array(last_text, line_starters) || last_text === 'catch') {
                if (opt_space_before_conditional) {
                    output_space_before_token = true;
                }
            }

            // Support of this kind of newline preservation.
            // a = (b &&
            //     (c || d));
            if (token_text === '(') {
                if(last_type === 'TK_EQUALS' || last_type === 'TK_OPERATOR') {
                    if (flags.mode !== 'OBJECT') {
                        allow_wrap_or_preserved_newline();
                    }
                }
            }
            print_token();

            break;

        case 'TK_DOT':

            if (is_special_word(last_text)) {
                output_space_before_token = true;
            } else {
                // allow preserved newlines before dots in general
                // force newlines on dots after close paren when break_chained - for bar().baz()
                allow_wrap_or_preserved_newline(last_text === ')' && opt_break_chained_methods);
            }

            print_token();
            break;

        case 'TK_END_EXPR':
            if (token_text === ']') {
                if (!opt_keep_array_indentation) {
                    if (flags.mode === '[INDENTED-EXPRESSION]') {
                        if (last_text === ']') {
                            restore_mode();
                            print_newline();
                            print_token();
                            break;
                        }
                    }
                }
            }
            restore_mode();
            print_token();

            // do {} while () // no statement required after
            if (flags.do_while && flags.previous_mode === '(COND-EXPRESSION)')
            {
                flags.previous_mode = '(EXPRESSION)';
                flags.do_block = false;
                flags.do_while = false;

            }

            break;

        case 'TK_START_BLOCK':
            set_mode('BLOCK');

            if (opt_brace_style === "expand" || opt_brace_style === "expand-strict") {
                var empty_braces = false;
                if (opt_brace_style === "expand-strict") {
                    empty_braces = (look_up() === '}');
                    if (!empty_braces) {
                        print_newline();
                    }
                } else {
                    if (last_type !== 'TK_OPERATOR') {
                        if (last_type === 'TK_EQUALS' ||
                            (is_special_word(last_text) && last_text !== 'else')) {
                            output_space_before_token = true;
                        } else {
                            print_newline();
                        }
                    }
                }
                print_token();
                if (!empty_braces) {
                    indent();
                }
            } else {
                if (last_type !== 'TK_OPERATOR' && last_type !== 'TK_START_EXPR') {
                    if (last_type === 'TK_START_BLOCK') {
                        print_newline();
                    } else {
                        output_space_before_token = true;
                    }
                } else {
                    // if TK_OPERATOR or TK_START_EXPR
                    if (is_array(flags.previous_mode) && last_text === ',') {
                        if (last_last_text === '}') {
                            // }, { in array context
                            output_space_before_token = true;
                        } else {
                            print_newline(); // [a, b, c, {
                        }
                    }
                }
                print_token();
                indent();
            }

            break;

        case 'TK_END_BLOCK':
            restore_mode();
            if (opt_brace_style === "expand" || opt_brace_style === "expand-strict") {
                if (last_text !== '{') {
                    print_newline();
                }
                print_token();
            } else {
                if (last_type === 'TK_START_BLOCK') {
                    // {}
                } else {
                    if (is_array(flags.mode) && opt_keep_array_indentation) {
                        // we REALLY need a newline here, but newliner would skip that
                        opt_keep_array_indentation = false;
                        print_newline();
                        opt_keep_array_indentation = true;

                    } else {
                        print_newline();
                    }
                }
                print_token();
            }
            break;

        case 'TK_WORD':
            if (start_of_statement()) {
               // The conditional starts the statement if appropriate.
            } else if (wanted_newline && last_type !== 'TK_OPERATOR'
                && last_type !== 'TK_EQUALS'
                && (opt_preserve_newlines || last_text !== 'var')) {
                print_newline();
            }


            // no, it's not you. even I have problems understanding how this works
            // and what does what.
            if (flags.do_block && !flags.do_while) {
                // do {} ## while ()
                if (token_text !== 'while') {
                    // if we don't see the expected while, recover
                    print_newline();
                    flags.do_block = false;
                } else {
                    output_space_before_token = true;
                    print_token();
                    output_space_before_token = true;
                    flags.do_while = true;
                    break;
                }
            }

            if (flags.if_block) {
                if(token_text !== 'else') {
                    while (flags.mode === 'STATEMENT') {
                        restore_mode();
                    }
                    flags.if_block = false;
                }
            }

            prefix = 'NONE';

            if (token_text === 'function') {
                if (flags.var_line && last_type !== 'TK_EQUALS' ) {
                    flags.var_line_reindented = true;
                }
                if ((just_added_newline() || last_text === ';') && last_text !== '{'
                && last_type !== 'TK_BLOCK_COMMENT' && last_type !== 'TK_COMMENT') {
                    // make sure there is a nice clean space of at least one blank line
                    // before a new function definition
                    n_newlines = just_added_newline() ? n_newlines : 0;
                    if (!opt_preserve_newlines) {
                        n_newlines = 1;
                    }

                    for (var i = 0; i < 2 - n_newlines; i++) {
                        print_newline(true);
                    }
                }
                if (last_type === 'TK_WORD') {
                    if (last_text === 'get' || last_text === 'set' || last_text === 'new' || last_text === 'return') {
                        output_space_before_token = true;
                    } else {
                        print_newline();
                    }
                } else if (last_type === 'TK_OPERATOR' || last_text === '=') {
                    // foo = function
                    output_space_before_token = true;
                } else if (is_expression(flags.mode)) {
                    // print nothing
                } else {
                    print_newline();
                }

                print_token();
                last_word = token_text;
                break;
            }

            if (token_text === 'case' || (token_text === 'default' && flags.in_case_statement)) {
                print_newline();
                if (flags.case_body) {
                    // switch cases following one another
                    flags.indentation_level--;
                    flags.case_body = false;
                }
                print_token();
                flags.in_case = true;
                flags.in_case_statement = true;
                break;
            }

            if (last_type === 'TK_END_BLOCK') {

                if (!in_array(token_text.toLowerCase(), ['else', 'catch', 'finally'])) {
                    prefix = 'NEWLINE';
                } else {
                    if (opt_brace_style === "expand" || opt_brace_style === "end-expand" || opt_brace_style === "expand-strict") {
                        prefix = 'NEWLINE';
                    } else {
                        prefix = 'SPACE';
                        output_space_before_token = true;
                    }
                }
            } else if (last_type === 'TK_SEMICOLON' && flags.mode === 'BLOCK') {
                prefix = 'NEWLINE';
            } else if (last_type === 'TK_SEMICOLON' && is_expression(flags.mode)) {
                prefix = 'SPACE';
            } else if (last_type === 'TK_STRING') {
                prefix = 'NEWLINE';
            } else if (last_type === 'TK_WORD') {
                prefix = 'SPACE';
            } else if (last_type === 'TK_START_BLOCK') {
                prefix = 'NEWLINE';
            } else if (last_type === 'TK_END_EXPR') {
                output_space_before_token = true;
                prefix = 'NEWLINE';
            }

            if (in_array(token_text, line_starters) && last_text !== ')') {
                if (last_text === 'else') {
                    prefix = 'SPACE';
                } else {
                    prefix = 'NEWLINE';
                }

            }

            if (last_type === 'TK_COMMA' || last_type === 'TK_START_EXPR' || last_type === 'TK_EQUALS' || last_type === 'TK_OPERATOR') {
                if (flags.mode !== 'OBJECT') {
                    allow_wrap_or_preserved_newline();
                }
            }

            if (in_array(token_text.toLowerCase(), ['else', 'catch', 'finally'])) {
                if (last_type !== 'TK_END_BLOCK' || opt_brace_style === "expand" || opt_brace_style === "end-expand" || opt_brace_style === "expand-strict") {
                    print_newline();
                } else {
                    trim_output(true);
                    output_space_before_token = true;
                }
            } else if (prefix === 'NEWLINE') {
                if (is_special_word(last_text)) {
                    // no newline between 'return nnn'
                    output_space_before_token = true;
                } else if (last_type !== 'TK_END_EXPR') {
                    if ((last_type !== 'TK_START_EXPR' || token_text !== 'var') && last_text !== ':') {
                        // no need to force newline on 'var': for (var x = 0...)
                        if (token_text === 'if' && last_word === 'else' && last_text !== '{') {
                            // no newline for } else if {
                            output_space_before_token = true;
                        } else {
                            flags.var_line = false;
                            flags.var_line_reindented = false;
                            print_newline();
                        }
                    }
                } else if (in_array(token_text, line_starters) && last_text !== ')') {
                    flags.var_line = false;
                    flags.var_line_reindented = false;
                    print_newline();
                }
            } else if (is_array(flags.mode) && last_text === ',' && last_last_text === '}') {
                print_newline(); // }, in lists get a newline treatment
            } else if (prefix === 'SPACE') {
                output_space_before_token = true;
            }
            print_token();
            last_word = token_text;

            if (token_text === 'var') {
                flags.var_line = true;
                flags.var_line_reindented = false;
                flags.var_line_tainted = false;
            }

            if (token_text === 'do') {
                flags.do_block = true;
            }

            if (token_text === 'if') {
                flags.if_block = true;
            }

            break;

        case 'TK_SEMICOLON':
            while (flags.mode === 'STATEMENT' && !flags.if_block) {
                restore_mode();
            }
            print_token();
            flags.var_line = false;
            flags.var_line_reindented = false;
            if (flags.mode === 'OBJECT') {
                // OBJECT mode is weird and doesn't get reset too well.
                flags.mode = 'BLOCK';
            }
            break;

        case 'TK_STRING':
            if (start_of_statement()) {
                // The conditional starts the statement if appropriate.
                // One difference - strings want at least a space before
                output_space_before_token = true;
            } else if (last_type === 'TK_WORD') {
                output_space_before_token = true;
            } else if (last_type === 'TK_COMMA' || last_type === 'TK_START_EXPR' || last_type === 'TK_EQUALS' || last_type === 'TK_OPERATOR') {
                if (flags.mode !== 'OBJECT') {
                    allow_wrap_or_preserved_newline();
                }
            } else {
                print_newline();
            }
            print_token();
            break;

        case 'TK_EQUALS':
            if (flags.var_line) {
                // just got an '=' in a var-line, different formatting/line-breaking, etc will now be done
                flags.var_line_tainted = true;
            }
            output_space_before_token = true;
            print_token();
            output_space_before_token = true;
            break;

        case 'TK_COMMA':
            if (flags.var_line) {
                if (is_expression(flags.mode) || last_type === 'TK_END_BLOCK' ) {
                    // do not break on comma, for(var a = 1, b = 2)
                    flags.var_line_tainted = false;
                }
                if (flags.var_line_tainted) {
                    print_token();
                    flags.var_line_reindented = true;
                    flags.var_line_tainted = false;
                    print_newline();
                    break;
                } else {
                    flags.var_line_tainted = false;
                }

                print_token();
                output_space_before_token = true;
                break;
            }

            if (last_type === 'TK_END_BLOCK' && flags.mode !== "(EXPRESSION)") {
                print_token();
                if (flags.mode === 'OBJECT' && last_text === '}') {
                    print_newline();
                } else {
                    output_space_before_token = true;
                }
            } else {
                if (flags.mode === 'OBJECT') {
                    print_token();
                    print_newline();
                } else {
                    // EXPR or DO_BLOCK
                    print_token();
                    output_space_before_token = true;
                }
            }
            break;


        case 'TK_OPERATOR':

            var space_before = true;
            var space_after = true;
            if (is_special_word(last_text)) {
                // "return" had a special handling in TK_WORD. Now we need to return the favor
                output_space_before_token = true;
                print_token();
                break;
            }

            // hack for actionscript's import .*;
            if (token_text === '*' && last_type === 'TK_DOT' && !last_last_text.match(/^\d+$/)) {
                print_token();
                break;
            }

            if (token_text === ':' && flags.in_case) {
                flags.case_body = true;
                indent();
                print_token();
                print_newline();
                flags.in_case = false;
                break;
            }

            if (token_text === '::') {
                // no spaces around exotic namespacing syntax operator
                print_token();
                break;
            }

            if (in_array(token_text, ['--', '++', '!']) || (in_array(token_text, ['-', '+']) && (in_array(last_type, ['TK_START_BLOCK', 'TK_START_EXPR', 'TK_EQUALS', 'TK_OPERATOR']) || in_array(last_text, line_starters) || last_text == ','))) {
                // unary operators (and binary +/- pretending to be unary) special cases

                space_before = false;
                space_after = false;

                if (last_text === ';' && is_expression(flags.mode)) {
                    // for (;; ++i)
                    //        ^^^
                    space_before = true;
                }
                if (last_type === 'TK_WORD' && in_array(last_text, line_starters)) {
                    space_before = true;
                }

                if ((flags.mode === 'BLOCK' || flags.mode === 'STATEMENT') && (last_text === '{' || last_text === ';')) {
                    // { foo; --i }
                    // foo(); --bar;
                    print_newline();
                }
            } else if (token_text === ':') {
                if (flags.ternary_depth === 0) {
                    if (flags.mode === 'BLOCK') {
                        flags.mode = 'OBJECT';
                    }
                    space_before = false;
                } else {
                    flags.ternary_depth -= 1;
                }
            } else if (token_text === '?') {
                flags.ternary_depth += 1;
            }
            output_space_before_token = output_space_before_token || space_before;
            print_token();
            output_space_before_token = space_after;
            break;

        case 'TK_BLOCK_COMMENT':

            var lines = split_newlines(token_text);
            var j; // iterator for this case

            if (all_lines_start_with(lines.slice(1), '*')) {
                // javadoc: reformat and reindent
                print_newline(false,true);
                print_token(lines[0]);
                for (j = 1; j < lines.length; j++) {
                    print_newline(false,true);
                    print_token(' ' + trim(lines[j]));
                }

            } else {

                // simple block comment: leave intact
                if (lines.length > 1) {
                    // multiline comment block starts with a new line
                    print_newline(false,true);
                } else {
                    // single-line /* comment */ stays where it is
                    if (last_type === 'TK_END_BLOCK') {
                        print_newline(false,true);
                    } else {
                        output_space_before_token = true;
                    }

                }

                print_token(lines[0]);
                output.push("\n");
                for (j = 1; j < lines.length; j++) {
                    output.push(lines[j]);
                    output.push("\n");
                }

            }
            if (look_up('\n') !== '\n') {
                print_newline(false,true);
            }
            break;


        case 'TK_INLINE_COMMENT':
            output_space_before_token = true;
            print_token();
            output_space_before_token = true;
            break;

        case 'TK_COMMENT':
            if (wanted_newline) {
                print_newline(false,true);
            }
            if (last_text === ',' && !wanted_newline) {
                trim_output(true);
            }

            output_space_before_token = true;
            print_token();
            print_newline(false,true);

            break;

        case 'TK_UNKNOWN':
            print_token();
            if(token_text[token_text.length - 1] === '\n')
                print_newline();
            break;
        }

        // The cleanest handling of inline comments is to treat them as though they aren't there.
        // Just continue formatting and the behavior should be logical.
        // Also ignore unknown tokens.  Again, the should result in better behavior.
        if(token_type !== 'TK_INLINE_COMMENT' && token_type !== 'TK_COMMENT' &&
                token_type !== 'TK_UNKNOWN') {
            last_last_text = last_text;
            last_type = token_type;
            last_text = token_text;
        }
    }

    var sweet_code = preindent_string + output.join('').replace(/[\r\n ]+$/, '');
    return sweet_code;

}

// Add support for CommonJS. Just put this file somewhere on your require.paths
// and you will be able to `var js_beautify = require("beautify").js_beautify`.
if (typeof exports !== "undefined") {
    exports.js_beautify = js_beautify;
}
