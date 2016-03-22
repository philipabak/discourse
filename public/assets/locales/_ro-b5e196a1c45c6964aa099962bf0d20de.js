/*global I18n:true */

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (searchElement, fromIndex) {
    if ( this === undefined || this === null ) {
      throw new TypeError( '"this" is null or not defined' );
    }

    var length = this.length >>> 0; // Hack to convert object.length to a UInt32

    fromIndex = +fromIndex || 0;

    if (Math.abs(fromIndex) === Infinity) {
      fromIndex = 0;
    }

    if (fromIndex < 0) {
      fromIndex += length;
      if (fromIndex < 0) {
        fromIndex = 0;
      }
    }

    for (;fromIndex < length; fromIndex++) {
      if (this[fromIndex] === searchElement) {
        return fromIndex;
      }
    }

    return -1;
  };
}

// Instantiate the object
var I18n = I18n || {};

// Set default locale to english
I18n.defaultLocale = "en";

// Set default handling of translation fallbacks to false
I18n.fallbacks = false;

// Set default separator
I18n.defaultSeparator = ".";

// Set current locale to null
I18n.locale = null;

// Set the placeholder format. Accepts `{{placeholder}}` and `%{placeholder}`.
I18n.PLACEHOLDER = /(?:\{\{|%\{)(.*?)(?:\}\}?)/gm;

I18n.fallbackRules = {};

I18n.noFallbacks = false;

I18n.pluralizationRules = {
  en: function(n) {
    return n === 0 ? ["zero", "none", "other"] : n === 1 ? "one" : "other";
  },
  "zh_CN": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  },
  "zh_TW": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  },
  "ko": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  }
};

I18n.getFallbacks = function(locale) {
  if (locale === I18n.defaultLocale) {
    return [];
  } else if (!I18n.fallbackRules[locale]) {
    var rules = [],
        components = locale.split("-");

    for (var l = 1; l < components.length; l++) {
      rules.push(components.slice(0, l).join("-"));
    }

    rules.push(I18n.defaultLocale);

    I18n.fallbackRules[locale] = rules;
  }

  return I18n.fallbackRules[locale];
};

I18n.isValidNode = function(obj, node, undefined) {
  return obj[node] !== null && obj[node] !== undefined;
};

I18n.lookup = function(scope, options) {
  options = options || {};
  var lookupInitialScope = scope,
      translations = this.prepareOptions(I18n.translations),
      locale = options.locale || I18n.currentLocale(),
      messages = translations[locale] || {},
      currentScope;

  options = this.prepareOptions(options);

  if (typeof scope === "object") {
    scope = scope.join(this.defaultSeparator);
  }

  if (options.scope) {
    scope = options.scope.toString() + this.defaultSeparator + scope;
  }

  scope = scope.split(this.defaultSeparator);

  while (messages && scope.length > 0) {
    currentScope = scope.shift();
    messages = messages[currentScope];
  }

  if (!messages) {
    if (I18n.fallbacks) {
      var fallbacks = this.getFallbacks(locale);
      for (var fallback = 0; fallback < fallbacks.length; fallbacks++) {
        messages = I18n.lookup(lookupInitialScope, this.prepareOptions({locale: fallbacks[fallback]}, options));
        if (messages) {
          break;
        }
      }
    }

    if (!messages && this.isValidNode(options, "defaultValue")) {
        messages = options.defaultValue;
    }
  }

  return messages;
};

// Merge serveral hash options, checking if value is set before
// overwriting any value. The precedence is from left to right.
//
//   I18n.prepareOptions({name: "John Doe"}, {name: "Mary Doe", role: "user"});
//   #=> {name: "John Doe", role: "user"}
//
I18n.prepareOptions = function() {
  var options = {},
      opts,
      count = arguments.length;

  for (var i = 0; i < count; i++) {
    opts = arguments[i];

    if (!opts) {
      continue;
    }

    for (var key in opts) {
      if (!this.isValidNode(options, key)) {
        options[key] = opts[key];
      }
    }
  }

  return options;
};

I18n.interpolate = function(message, options) {
  options = this.prepareOptions(options);
  var matches = message.match(this.PLACEHOLDER),
      placeholder,
      value,
      name;

  if (!matches) {
    return message;
  }

  for (var i = 0; placeholder = matches[i]; i++) {
    name = placeholder.replace(this.PLACEHOLDER, "$1");

    value = options[name];

    if (!this.isValidNode(options, name)) {
      value = "[missing " + placeholder + " value]";
    }

    var regex = new RegExp(placeholder.replace(/\{/gm, "\\{").replace(/\}/gm, "\\}"));
    message = message.replace(regex, value);
  }

  return message;
};

I18n.translate = function(scope, options) {
  options = this.prepareOptions(options);
  var translation = this.lookup(scope, options);
  // Fallback to the default locale
  if (!translation && this.currentLocale() !== this.defaultLocale && !this.noFallbacks) {
    options.locale = this.defaultLocale;
    translation = this.lookup(scope, options);
  }
  if (!translation && this.currentLocale() !== 'en' && !this.noFallbacks) {
    options.locale = 'en';
    translation = this.lookup(scope, options);
  }

  try {
    if (typeof translation === "object") {
      if (typeof options.count === "number") {
        return this.pluralize(options.count, scope, options);
      } else {
        return translation;
      }
    } else {
      return this.interpolate(translation, options);
    }
  } catch (error) {
    return this.missingTranslation(scope);
  }
};

I18n.localize = function(scope, value) {
  switch (scope) {
    case "currency":
      return this.toCurrency(value);
    case "number":
      scope = this.lookup("number.format");
      return this.toNumber(value, scope);
    case "percentage":
      return this.toPercentage(value);
    default:
      if (scope.match(/^(date|time)/)) {
        return this.toTime(scope, value);
      } else {
        return value.toString();
      }
  }
};

I18n.parseDate = function(date) {
  var matches, convertedDate;

  // we have a date, so just return it.
  if (typeof date === "object") {
    return date;
  }

  // it matches the following formats:
  //   yyyy-mm-dd
  //   yyyy-mm-dd[ T]hh:mm::ss
  //   yyyy-mm-dd[ T]hh:mm::ss
  //   yyyy-mm-dd[ T]hh:mm::ssZ
  //   yyyy-mm-dd[ T]hh:mm::ss+0000
  //
  matches = date.toString().match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|\+0000)?/);

  if (matches) {
    for (var i = 1; i <= 6; i++) {
      matches[i] = parseInt(matches[i], 10) || 0;
    }

    // month starts on 0
    matches[2] -= 1;

    if (matches[7]) {
      convertedDate = new Date(Date.UTC(matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]));
    } else {
      convertedDate = new Date(matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]);
    }
  } else if (typeof date === "number") {
    // UNIX timestamp
    convertedDate = new Date();
    convertedDate.setTime(date);
  } else if (date.match(/\d+ \d+:\d+:\d+ [+-]\d+ \d+/)) {
    // a valid javascript format with timezone info
    convertedDate = new Date();
    convertedDate.setTime(Date.parse(date));
  } else {
    // an arbitrary javascript string
    convertedDate = new Date();
    convertedDate.setTime(Date.parse(date));
  }

  return convertedDate;
};

I18n.toTime = function(scope, d) {
  var date = this.parseDate(d),
      format = this.lookup(scope);

  if (date.toString().match(/invalid/i)) {
    return date.toString();
  }

  if (!format) {
    return date.toString();
  }

  return this.strftime(date, format);
};

I18n.strftime = function(date, format) {
  var options = this.lookup("date");

  if (!options) {
    return date.toString();
  }

  options.meridian = options.meridian || ["AM", "PM"];

  var weekDay = date.getDay(),
      day = date.getDate(),
      year = date.getFullYear(),
      month = date.getMonth() + 1,
      hour = date.getHours(),
      hour12 = hour,
      meridian = hour > 11 ? 1 : 0,
      secs = date.getSeconds(),
      mins = date.getMinutes(),
      offset = date.getTimezoneOffset(),
      absOffsetHours = Math.floor(Math.abs(offset / 60)),
      absOffsetMinutes = Math.abs(offset) - (absOffsetHours * 60),
      timezoneoffset = (offset > 0 ? "-" : "+") + (absOffsetHours.toString().length < 2 ? "0" + absOffsetHours : absOffsetHours) + (absOffsetMinutes.toString().length < 2 ? "0" + absOffsetMinutes : absOffsetMinutes);

  if (hour12 > 12) {
    hour12 = hour12 - 12;
  } else if (hour12 === 0) {
    hour12 = 12;
  }

  var padding = function(n) {
    var s = "0" + n.toString();
    return s.substr(s.length - 2);
  };

  var f = format;
  f = f.replace("%a", options.abbr_day_names[weekDay]);
  f = f.replace("%A", options.day_names[weekDay]);
  f = f.replace("%b", options.abbr_month_names[month]);
  f = f.replace("%B", options.month_names[month]);
  f = f.replace("%d", padding(day));
  f = f.replace("%e", day);
  f = f.replace("%-d", day);
  f = f.replace("%H", padding(hour));
  f = f.replace("%-H", hour);
  f = f.replace("%I", padding(hour12));
  f = f.replace("%-I", hour12);
  f = f.replace("%m", padding(month));
  f = f.replace("%-m", month);
  f = f.replace("%M", padding(mins));
  f = f.replace("%-M", mins);
  f = f.replace("%p", options.meridian[meridian]);
  f = f.replace("%S", padding(secs));
  f = f.replace("%-S", secs);
  f = f.replace("%w", weekDay);
  f = f.replace("%y", padding(year));
  f = f.replace("%-y", padding(year).replace(/^0+/, ""));
  f = f.replace("%Y", year);
  f = f.replace("%z", timezoneoffset);

  return f;
};

I18n.toNumber = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.format"),
    {precision: 3, separator: ".", delimiter: ",", strip_insignificant_zeros: false}
  );

  var negative = number < 0,
      string = Math.abs(number).toFixed(options.precision).toString(),
      parts = string.split("."),
      precision,
      buffer = [],
      formattedNumber;

  number = parts[0];
  precision = parts[1];

  while (number.length > 0) {
    buffer.unshift(number.substr(Math.max(0, number.length - 3), 3));
    number = number.substr(0, number.length -3);
  }

  formattedNumber = buffer.join(options.delimiter);

  if (options.precision > 0) {
    formattedNumber += options.separator + parts[1];
  }

  if (negative) {
    formattedNumber = "-" + formattedNumber;
  }

  if (options.strip_insignificant_zeros) {
    var regex = {
        separator: new RegExp(options.separator.replace(/\./, "\\.") + "$"),
        zeros: /0+$/
    };

    formattedNumber = formattedNumber
      .replace(regex.zeros, "")
      .replace(regex.separator, "")
    ;
  }

  return formattedNumber;
};

I18n.toCurrency = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.currency.format"),
    this.lookup("number.format"),
    {unit: "$", precision: 2, format: "%u%n", delimiter: ",", separator: "."}
  );

  number = this.toNumber(number, options);
  number = options.format
    .replace("%u", options.unit)
    .replace("%n", number)
  ;

  return number;
};

I18n.toHumanSize = function(number, options) {
  var kb = 1024,
      size = number,
      iterations = 0,
      unit,
      precision;

  while (size >= kb && iterations < 4) {
    size = size / kb;
    iterations += 1;
  }

  if (iterations === 0) {
    unit = this.t("number.human.storage_units.units.byte", {count: size});
    precision = 0;
  } else {
    unit = this.t("number.human.storage_units.units." + [null, "kb", "mb", "gb", "tb"][iterations]);
    precision = (size - Math.floor(size) === 0) ? 0 : 1;
  }

  options = this.prepareOptions(
    options,
    {precision: precision, format: "%n%u", delimiter: ""}
  );

  number = this.toNumber(size, options);
  number = options.format
    .replace("%u", unit)
    .replace("%n", number)
  ;

  return number;
};

I18n.toPercentage = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.percentage.format"),
    this.lookup("number.format"),
    {precision: 3, separator: ".", delimiter: ""}
  );

  number = this.toNumber(number, options);
  return number + "%";
};

I18n.pluralizer = function(locale) {
  var pluralizer = this.pluralizationRules[locale];
  if (pluralizer !== undefined) return pluralizer;
  return this.pluralizationRules["en"];
};

I18n.findAndTranslateValidNode = function(keys, translation) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (this.isValidNode(translation, key)) return translation[key];
  }
  return null;
};

I18n.pluralize = function(count, scope, options) {
  var translation;

  try { translation = this.lookup(scope, options); } catch (error) {}
  if (!translation) { return this.missingTranslation(scope); }

  options = this.prepareOptions(options);
  options.count = count.toString();

  var pluralizer = this.pluralizer(this.currentLocale());
  var key = pluralizer(Math.abs(count));
  var keys = ((typeof key === "object") && (key instanceof Array)) ? key : [key];

  var message = this.findAndTranslateValidNode(keys, translation);
  if (message == null) message = this.missingTranslation(scope, keys[0]);

  return this.interpolate(message, options);
};

I18n.missingTranslation = function(scope, key) {
  var message = '[' + this.currentLocale() + "." + scope;
  if (key) { message += "." + key; }
  return message + ']';
};

I18n.currentLocale = function() {
  return (I18n.locale || I18n.defaultLocale);
};

// shortcuts
I18n.t = I18n.translate;
I18n.l = I18n.localize;
I18n.p = I18n.pluralize;

I18n.enable_verbose_localization = function(){
  var counter = 0;
  var keys = {};
  var t = I18n.t;

  I18n.noFallbacks = true;

  I18n.t = I18n.translate = function(scope, value){
    var current = keys[scope];
    if(!current) {
      current = keys[scope] = ++counter;
      var message = "Translation #" + current + ": " + scope;
      if (!_.isEmpty(value)) {
        message += ", parameters: " + JSON.stringify(value);
      }
      Em.Logger.info(message);
    }
    return t.apply(I18n, [scope, value]) + " (t" + current + ")";
  };
};


I18n.verbose_localization_session = function(){
  sessionStorage.setItem("verbose_localization", "true");
  I18n.enable_verbose_localization();
  return true;
}

try {
  if(sessionStorage && sessionStorage.getItem("verbose_localization")) {
    I18n.enable_verbose_localization();
  }
} catch(e){
  // we don't care really, can happen if cookies disabled
}
;


MessageFormat = {locale: {}};
MessageFormat.locale.ro = function (n) {
  if (n == 1) {
    return 'one';
  }
  if (n === 0 || n != 1 && (n % 100) >= 1 &&
      (n % 100) <= 19 && n == Math.floor(n)) {
    return 'few';
  }
  return 'other';
};

I18n.messageFormat = (function(formats){
      var f = formats;
      return function(key, options) {
        var fn = f[key];
        if(fn){
          try {
            return fn(options);
          } catch(err) {
            return err.message;
          }
        } else {
          return 'Missing Key: ' + key
        }
        return f[key](options);
      };
    })({});I18n.translations = {"ro":{"js":{"number":{"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Bit","few":"Biți","other":"Biți"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}}},"dates":{"time":"HH:mm","long_no_year":"DD MMM HH:mm","long_no_year_no_time":"DD MMM","long_with_year":"DD MMM YYYY HH:mm","long_with_year_no_time":"DD MMM YYYY","long_date_with_year":"DD MMM 'YY HH:mm","long_date_without_year":"DD MMM HH:mm","long_date_with_year_without_time":"DD MMM 'YY","long_date_without_year_with_linebreak":"DD MMM\u003cbr/\u003eHH:mm","long_date_with_year_with_linebreak":"DD MMM 'YY\u003cbr/\u003eHH:mm","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","few":"\u003c %{count}s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","few":"%{count}s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","few":"\u003c %{count}m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","few":"%{count}m","other":"%{count}m"},"about_x_hours":{"one":"1h","few":"%{count}h","other":"%{count}h"},"x_days":{"one":"1z","few":"%{count}z","other":"%{count}z"},"about_x_years":{"one":"1a","few":"%{count}a","other":"%{count}a"},"over_x_years":{"one":"\u003e 1a","few":"\u003e %{count}a","other":"\u003e %{count}a"},"almost_x_years":{"one":"1a","few":"%{count}a","other":"%{count}a"},"date_month":"Z LLL","date_year":"LLL 'AA"},"medium":{"x_minutes":{"one":"1 min","few":"%{count} min","other":"%{count} min"},"x_hours":{"one":"1 oră","few":"%{count} ore","other":"%{count} ore"},"x_days":{"one":"1 zi","few":"%{count} zile","other":"%{count} zile"},"date_year":"Z LL AAAA"},"medium_with_ago":{"x_minutes":{"one":"acum 1 min","few":"acum %{count} min","other":"acum %{count} min"},"x_hours":{"one":"acum o oră","few":"acum %{count} ore","other":"acum %{count} ore"},"x_days":{"one":"acum o zi","few":"acum %{count} zile","other":"acum %{count} zile"}}},"share":{"topic":"distribuie adresă către această discuție","post":"distribuie o adresă către postarea #%{postNumber}","close":"închide","twitter":"distribuie această adresă pe Twitter","facebook":"distribuie această adresă pe Facebook","google+":"distribuie această adresă pe Google+","email":"trimite această adresă în email"},"action_codes":{"split_topic":"despartiti acest topic %{when}","autoclosed":{"enabled":"inchis %{count}","disabled":"deschis %{when}"},"closed":{"enabled":"inchis %{when}"},"archived":{"enabled":"arhivat %{when}","disabled":"dezarhivat %{when}"},"pinned":{"enabled":"Prins %{when}"}},"topic_admin_menu":"acțiuni subiect administrator","emails_are_disabled":"Trimiterea de emailuri a fost dezactivată global de către un administrator. Nu vor fi trimise notificări email de nici un fel.","edit":"editează titlul și categoria acestui subiect","not_implemented":"Această caracteristică nu a fost implementată încă, ne pare rău!","no_value":"Nu","yes_value":"Acceptă","generic_error":"Ne pare rău, a avut loc o eroare.","generic_error_with_reason":"A avut loc o eroare: %{error}","sign_up":"Înregistrare","log_in":"Autentificare","age":"Vârsta","joined":"Adăugat","admin_title":"Admin","flags_title":"Semnalare","show_more":"Detaliază","show_help":"Optiuni","links":"Adrese","links_lowercase":{"one":"adresă","few":"adrese","other":"adrese"},"faq":"Întrebări","guidelines":"Ajutor","privacy_policy":"Politică de confidențialitate","privacy":"Confidențialitate","terms_of_service":"Termenii serviciului","mobile_view":"Ecran pentru mobil","desktop_view":"Ecran pentru desktop","you":"Dumneavoastră","or":"sau","now":"Adineauri","read_more":"citește mai mult","more":"Mai mult","less":"Mai puțin","never":"Niciodată","daily":"Zilnic","weekly":"Săptămânal","every_two_weeks":"Odată la două săptamâni","every_three_days":"la fiecare trei zile","max_of_count":"max din {{count}}","alternation":"sau","character_count":{"one":"{{count}} caracter","few":"2 caractere","other":"{{count}} caractere"},"suggested_topics":{"title":"Subiecte Propuse"},"about":{"simple_title":"Despre","title":"Despre %{title}","stats":"Statistica site-ului","our_admins":"Doar administratorii","our_moderators":"Doar moderatorii","stat":{"all_time":"Tot timpul","last_7_days":"Ultimele 7 zile","last_30_days":"Ultimele 30 de zile"},"like_count":"Like-uri","topic_count":"Subiecte","post_count":"Postări","user_count":"Utilizatori noi","active_user_count":"Utilizatori activi","contact":"Contactați-ne","contact_info":"În cazul în care o problemă critică sau alt aspect urgent afectează site-ul, va rugăm să ne contactaţi la %{contact_info}."},"bookmarked":{"title":"Semn de carte","clear_bookmarks":"Șterge semnele de carte","help":{"bookmark":"Click pentru plasare semn de carte pe prima postare a acestei discuții","unbookmark":"Click pentru ștergerea tuturor semnelor de carte din această discuție"}},"bookmarks":{"not_logged_in":"ne pare rău, trebuie să fii autentificat pentru a pune un semn de carte","created":"Ai pus semn de carte pe acest mesaj","not_bookmarked":"Ai citit deja aceast mesaj; fă clic să adaugi semn de carte","last_read":"Acesta este ultimul mesaj citit de tine; fă click să adaugi semn de carte","remove":"Semn de carte înlăturat","confirm_clear":"Sunteţi sigur că doriţi să ştergeţi toate bookmark-urile din acest subiect?"},"topic_count_latest":{"one":"{{count}} subiect nou sau actualizat.","few":"{{count}} subiecte noi sau actualizate.","other":"{{count}} subiecte noi sau actualizate."},"topic_count_unread":{"one":"{{count}} subiect necitit.","few":"{{count}} subiecte necitite.","other":"{{count}} subiecte necitite."},"topic_count_new":{"one":"{{count}} subiect nou.","few":"{{count}} subiecte noi.","other":"{{count}} subiecte noi."},"click_to_show":"Click pentru vizualizare.","preview":"vizualizează","cancel":"anulează","save":"Salvează Schimbările","saving":"Salvează...","saved":"Salvat!","upload":"Încarcă","uploading":"Încărcare...","uploaded":"Încărcat!","enable":"Activează","disable":"Dezactivează","undo":"Anulează acțiunea precedentă","revert":"Rescrie acțiunea precedentă","failed":"Eșuat","switch_to_anon":"Mod anonim","banner":{"close":"Ignoră acest banner."},"choose_topic":{"none_found":"Nu au fost găsite discuții.","title":{"search":"Caută o discuție după nume, url sau id:","placeholder":"Scrie aici titlul discuției"}},"queue":{"topic":"Discuție:","approve":"Aprobare","reject":"Respinge","delete_user":"Şterge utilizatorul","title":"Necesită aprobare","none":"Nu sunt postări de revizuit.","edit":"Editează","cancel":"Anulează","view_pending":"vezi postările în aşteptare","confirm":"Salvează Schimbările","delete_prompt":"Sunteţi sigur că vreţi să ştergeţi  \u003cb\u003e%{username}\u003c/b\u003e? Această operaţiune va şterge toate postările, va bloca adresa de email şi adresa de IP.","approval":{"title":"Necesită aprobare","description":"Am primit nouă postare dar trebuie să fie aprobată de un moderator înainte că ea să apară pe site. Va rugăm să aveţi răbdare.","pending_posts":{"one":"Aveţi \u003cstrong\u003e1\u003c/strong\u003e postare în aşteptare.","few":"Aveţi \u003cstrong\u003e{{count}}\u003c/strong\u003e postări în aşteptare.","other":"Aveţi \u003cstrong\u003e{{count}}\u003c/strong\u003e postări în aşteptare."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e a postat \u003ca href='{{topicUrl}}'\u003ediscuția\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eDvs.\u003c/a\u003e aţi postat \u003ca href='{{topicUrl}}'\u003ediscuția\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003ea răspuns la\u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e a răspuns la \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e a răspuns la \u003ca href='{{topicUrl}}'\u003ediscuție\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eYou\u003c/a\u003e a răspuns la \u003ca href='{{topicUrl}}'\u003ediscuție\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e a menționat \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e a menționat \u003ca href='{{user2Url}}'\u003eyou\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eYou\u003c/a\u003e a menționat \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Postat de către \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Postat de către \u003ca href='{{userUrl}}'\u003etine\u003c/a\u003e","sent_by_user":"Trimis de către \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Trimis de către \u003ca href='{{userUrl}}'\u003etine\u003c/a\u003e"},"directory":{"filter_name":"filtrează după utilizator","title":"Utilizatori","likes_given":"Oferite","likes_received":"Primite","topics_entered":"Subiecte","topics_entered_long":"Vizitate","time_read":"Timp citit","topic_count":"Subiecte","topic_count_long":"Subiecte create","post_count":"Răspunsuri","post_count_long":"Răspunsuri postate","no_results":"Fără rezultat.","days_visited":"Vizite","days_visited_long":"Zile de vizită","posts_read":"Citite","posts_read_long":"Posturi citite","total_rows":{"one":"1 utilizator","few":"%{count} utilizatori","other":"%{count} utilizatori"}},"groups":{"visible":"Grupul este vizibil tuturor utilizatorilor","title":{"one":"grup","few":"grupuri","other":"grupuri"},"members":"Membri","posts":"Postări","alias_levels":{"title":"Cine poate folosii acest grup ca pseudonim?","nobody":"Nimeni","only_admins":"Doar Adminii","mods_and_admins":"Doar moderatorii și adminii","members_mods_and_admins":"Doar membri grupului, moderatorii și adminii","everyone":"Toată lumea"}},"user_action_groups":{"1":"Aprecieri Date","2":"Aprecieri Primite","3":"Semne de carte","4":"Discuții","5":"Răspunsuri","6":"Răspunsuri","7":"Mențiuni","9":"Citate","10":"Participări","11":"Editări","12":"Obiecte Trimise","13":"Primite","14":"În așteptare"},"categories":{"all":"toate categoriile","all_subcategories":"toate","no_subcategory":"niciuna","category":"Categorie","reorder":{"title":"Rearanjeaza Categoriile","title_long":"Rearanjeaza lista de categorii","fix_order":"Pozitii fixe","fix_order_tooltip":"Nu toate categoriile au un numar de pozitie unic, asta poate cauze rezultate neasteptate.","save":"Salveaza ordinea","apply_all":"Aplica","position":"Pozitie"},"posts":"Postări","topics":"Discuții","latest":"Ultimele","latest_by":"recente dupa","toggle_ordering":"Control comandă comutare","subcategories":"Subcategorie","topic_stats":"Numărul de discuții noi.","topic_stat_sentence":{"one":"%{count} subiect în %{unit}.","few":"%{count} subiecte noi în %{unit}.","other":"%{count} subiecte noi în %{unit}."},"post_stats":"Numărul de postări noi.","post_stat_sentence":{"one":"%{count} mesaj nou in ultimele %{unit}.","few":"%{count} mesaje noi in ultimele %{unit}.","other":"%{count} mesaje noi in ultimele %{unit}."}},"ip_lookup":{"title":"Căutare adresă IP","hostname":"Nume gazdă","location":"Locație","location_not_found":"(necunoscut)","organisation":"Organizație","phone":"Telefon","other_accounts":"Alte conturi cu această adresă IP","delete_other_accounts":"Șterge %{count}","username":"nume de utilizator","trust_level":"TL","read_time":"Timp de citire","topics_entered":"Discuții la care particip","post_count":"# postari","confirm_delete_other_accounts":"Sunteți sigur că vreți să ștergeți aceste conturi?"},"user_fields":{"none":"(selecteaza o optiune)"},"user":{"said":"{{username}} a spus:","profile":"Profil","mute":"Anulează","edit":"Editează Preferințe","download_archive":"descarcă arhiva postărilor mele","new_private_message":"Mesaj nou","private_message":"Mesaj","private_messages":"Mesaje","activity_stream":"Activitate","preferences":"Preferințe","expand_profile":"Extinde","bookmarks":"Semne de carte","bio":"Despre mine","invited_by":"Invitat de","trust_level":"Nivel de Încredere","notifications":"Notificări","desktop_notifications":{"label":"Notificari desktop","not_supported":"Notificarile nu sunt suportate in acest browser. Scuze.","perm_default":"Activeaza notificarile","perm_denied_btn":"Nu se permite accesul","perm_denied_expl":"Ai blocat permisia pentru notificari. Utilieaza un browser pentru a le activa, apoi apasa butonul cand este gata. (Desktop: Iconita din stanga barei de adrese. Mobil: 'site Info'.)","disable":"Dezactiveaza notificarile","currently_enabled":"(acum activat)","enable":"Activeaza Notificarile","currently_disabled":"(acum dezactivate)","each_browser_note":"Notati: Setarile vor fi modificate pe orice alt browser."},"dismiss_notifications":"Marchează toate ca citite","dismiss_notifications_tooltip":"Marchează cu citit toate notificările necitite","disable_jump_reply":"Nu sări la postarea mea după ce răspund","dynamic_favicon":"Arată subiectele noi/actualizate în iconiţă browserului.","edit_history_public":"Permite altor utilizatori să vizualizeze reviziile postului meu","external_links_in_new_tab":"Deschide toate adresele externe într-un tab nou","enable_quoting":"Activează răspunsuri-citat pentru textul selectat","change":"schimbă","moderator":"{{user}} este moderator","admin":"{{user}} este admin","moderator_tooltip":"Acest user este moderator","admin_tooltip":"Acest user este admin","blocked_tooltip":"Acest utilizator este blocat.","suspended_notice":"Acest user este suspendat păna la {{date}}.","suspended_reason":"Motiv: ","github_profile":"Github","mailing_list_mode":"Trimite un email pentru fiecare postare (dacă nu am setat modul tăcut pentru discuţie sau categorie)","watched_categories":"Văzut","tracked_categories":"Tracked","muted_categories":"Muted","delete_account":"Șterge-mi contul","delete_account_confirm":"Ești sigur că vrei sa ștergi contul? Această acțiune poate fi anulată!","deleted_yourself":"Contul tău a fost șters cu succes.","delete_yourself_not_allowed":"Nu iți poți sterge contul deocamdată. Contactează administratorul pentru ștergerea contului.","unread_message_count":"Mesaje","admin_delete":"Șterge","users":"Utilizatori","muted_users":"Silențios","muted_users_instructions":"Suprimă toate notificările de la aceşti utilizatori","muted_topics_link":"Arata topicurile dezactivate.","staff_counters":{"flags_given":"Semnale ajutătoare","flagged_posts":"postări semnalate","deleted_posts":"postări șterse","suspensions":"suspendări","warnings_received":"avertizări"},"messages":{"all":"Toate","mine":"Ale mele","unread":"Necitite"},"change_password":{"success":"(email trimis)","in_progress":"(se trimite email)","error":"(eroare)","action":"Trimite email pentru resetare parolă","set_password":"Introduceți parolă"},"change_about":{"title":"Schimbă la Profil","error":"A apărut o eroare la schimbarea acestei valori"},"change_username":{"title":"Schimbă numele utilizatorului","confirm":"Dacă schimbați numele utilizatorului, toate citatele din posturile precedente inclusiv mențiunile de nume vor fi anulate. Ești absolut sigur?","taken":"Ne pare rău, acest nume de utilizator este deja folosit.","error":"S-a intâmpinat o eroare pe parcursul schimbării numelui de utilizator.","invalid":"Acest nume de utilizator este invalid. Trebuie să includă doar cifre și litere."},"change_email":{"title":"Schimbă Email","taken":"Ne pare rău, acest email nu este disponibil.","error":"S-a întâmpinat o eroare la schimbarea de email. Poate această adresă este deja in folosința?","success":"Am trimis un email către adresa respectivă. Urmați, vă rugăm, instrucțiunile de confirmare."},"change_avatar":{"title":"Schimbă poză profilului personal","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, bazat pe","gravatar_title":"Schimbă avatarul de pe site-ul Gravatar.","refresh_gravatar_title":"Reîmprospatați Gravatarul","letter_based":"Poză profilul atribuită de sistem.","uploaded_avatar":"Poză preferată","uploaded_avatar_empty":"Adaugă poza preferată","upload_title":"Încarcă poza personală","upload_picture":"Încarcă poza","image_is_not_a_square":"Atenţie: poză este decupată, dar înălţimea şi lăţimea nu sunt egale.","cache_notice":"Fotografia de profil a fost schimbata, dar poate dura ceva timp pana sa apara datorita caching-ului din browser."},"change_profile_background":{"title":"Datele Profilului","instructions":"Fundalul profilului va fi centrat şi va avea o dimensiune standard de 850px."},"change_card_background":{"title":"Fundal","instructions":"Fundalul va fi centrat şi va avea o dimensiune standard de 590px."},"email":{"title":"Email","instructions":"Emailul dumneavoastră nu va fi făcut public.","ok":"Arată bine. Vă trimitem un email pentru confirmare.","invalid":"introduceți o adresă validă pentru confirmare.","authenticated":"Emailul dumneavoastră a fost autentificat de către {{provider}}."},"name":{"title":"Nume","instructions":"Versiunea lungă a numelui.","instructions_required":"Numele dvs. complet","too_short":"Numele este prea scurt.","ok":"Numele dvs arată bine."},"username":{"title":"Nume Utilizator","instructions":"Numele de utilizator trebuie sa fie unic, fără spații, scurt.","short_instructions":"Ceilalți te pot numii @{{username}}.","available":"Numele de utilizator este valabil.","global_match":"Emailul se potrivește numelui de utilizator înregistrat.","global_mismatch":"Deja înregistrat. Încearcă:{{suggestion}}?","not_available":"Nu este valabil. Încearcă:{{suggestion}}?","too_short":"Numele de utilizator este prea scurt.","too_long":"Numele de utilizator este prea lung.","checking":"Verifică valabilitatea numelui de utilizator...","enter_email":"Nume de utilizator găsit. Introduceți emailul potrivit.","prefilled":"Emailul se potrivește cu numele de utilizator înregistrat."},"locale":{"title":"Limba interfeței","instructions":"Limba este folosită de interfața forumului. Schimbarea se va produce odată ce reîmprospatați pagina.","default":"(din oficiu)"},"password_confirmation":{"title":"Incă odată parola"},"last_posted":"Ultima postare","last_emailed":"Ultimul email dat","last_seen":"Văzut","created":"Participare","log_out":"Ieșire","location":"Locație","card_badge":{"title":"Insignă utilizator"},"website":"Website","email_settings":"Email","email_digests":{"title":"Cand nu vizitez site-ul, trimite-mi un email cu rezumatul noutăților:","daily":"zilnic","every_three_days":"la fiecare trei zile","weekly":"săptămânal","every_two_weeks":"la fiecare două săptămâni"},"email_direct":"Trimite un email când cineva mă citează, îmi răspunde la un post, menţionează @username meu, sau mă invită la o discuţie.","email_private_messages":"Trimite-mi un mesaj când cineva îmi răspunde.","email_always":"Trimite-mi notificarile de email atunci cand sunt activ pe site.","other_settings":"Altele","categories_settings":"Categorii","new_topic_duration":{"label":"Consideră discuțiile ca fiind noi","not_viewed":"Nu le-am văzut încă ","last_here":"Create de la ultima vizită ","after_1_day":"creat azi","after_2_days":"creat in ultimele 2 zile","after_1_week":"creat in ultima saptamana","after_2_weeks":"creat in ultimele 2 saptamni"},"auto_track_topics":"Urmăreşte automat discuţiile pe care le vizitez ","auto_track_options":{"never":"niciodată","immediately":"imediat","after_30_seconds":"dupa 30 de secunde","after_1_minute":"dupa 1 minut","after_2_minutes":"dupa 2 minute","after_3_minutes":"dupa 3 minute","after_4_minutes":"dupa 4 minute","after_5_minutes":"dupa 5 minute","after_10_minutes":"dupa 10 minute"},"invited":{"search":"Scrie pentru a căuta invitații...","title":"Invitații","user":"Utilizatori invitați","sent":"Trimis","none":"Nu sunt invitatii in asteptare de afisat.","redeemed":"Invitații rascumpărate","redeemed_at":"Răscumpărate","pending":"Invitații in așteptare","pending_tab":"In asteptare","pending_tab_with_count":"In asteptare ({{count}})","topics_entered":"Subiecte văzute","posts_read_count":"Posturi citite","expired":"Această invitație a expirat.","rescind":"Anulează","rescinded":"Invitație anulată","reinvite":"Retrimite Invitaţia","reinvited":"Invitaţia a fost retrimisă","time_read":"Timp de citit","days_visited":"Zile de vizită","account_age_days":"Vârsta contului în zile","create":"Trimite o invitație","bulk_invite":{"none":"Nu ai invitat încă pe nimeni. Poți trimite invitații individuale, sau mai multor oameni deodată prin \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003e incărcarea fișierului de invitație multiplă\u003c/a\u003e.","text":"Invitație multiplă din fișierul","uploading":"Incarcă","success":"Fişier încărcat cu succes, veţi fi înştiinţat printr-un mesaj când procesarea va fi completă.","error":"S-a întâmpinat o eroare la încărcarea fișierului '{{filename}}': {{message}}"}},"password":{"title":"Parolă","too_short":"Parola este prea scurtă.","common":"Această parolă este prea comună.","same_as_username":"Parolă este identică cu numele de utilizator","same_as_email":"Parolă este identică cu adresa de email","ok":"Parola dumneavoastră arată bine.","instructions":"Trebuiesc minim %{count} de caractere."},"associated_accounts":"Conectări","ip_address":{"title":"Ultima adresă de IP"},"registration_ip_address":{"title":"Înregistrarea adresei de IP"},"avatar":{"title":"Poză de profil","header_title":"profil, mesaje, favorite si preferințe"},"title":{"title":"Titlu"},"filters":{"all":"Toate"},"stream":{"posted_by":"Postat de","sent_by":"Trimis de","private_message":"mesaj","the_topic":"Subiectul"}},"loading":"Încarcă...","errors":{"prev_page":"în timp ce încarcă","reasons":{"network":"Eroare de rețea","server":"Eroare de server: {{code}}","forbidden":"Acces nepermis","unknown":"Eroare"},"desc":{"network":"Verificați conexiunea.","network_fixed":"Se pare ca și-a revenit.","server":"Ceva nu a funcționat.","forbidden":"Nu sunteţi autorizat să vedeţi aceasta.","not_found":"Oops, aplicatia incearca sa incarce un URL care nu exista.","unknown":"Ceva nu a funcționat."},"buttons":{"back":"Înapoi","again":"Încearcă din nou","fixed":"Încarcare pagină"}},"close":"Închide","assets_changed_confirm":"Acest site tocmai a fost updatat. Reîmprospătați pentru cea mai nouă versiune?","logout":"Aţi fost deconectat.","refresh":"Reîmprospătează","read_only_mode":{"enabled":"Modul doar citire a fost activat. Puteţi continuă să vizitaţi acest site dar anumite acţiuni vor fi limitate.","login_disabled":"Autentificarea este dezactivată când siteul este în modul doar pentru citit."},"learn_more":"află mai multe...","year":"an","year_desc":"discuții create în ultimile 365 de zile","month":"lună","month_desc":"discuții create în ultimile 30 de zile","week":"săptămană","week_desc":"discuții create în ultimile 7 zile","day":"zi","first_post":"Prima Postare","mute":"Anulare","unmute":"Activare","last_post":"Ultima Postare","last_reply_lowercase":"ultimul răspuns","replies_lowercase":{"one":"răspuns","few":"răspunsuri","other":"răspunsuri"},"signup_cta":{"sign_up":"Înregistrare","hide_session":"Aminteste-mi maine.","hide_forever":"Nu, Multumesc","hidden_for_session":"Ok, te vom intreba maine. Poti oricand folosi 'Autentificare' pentru a crea un cont.","value_prop":"Cand creati un cont nou, vom retine exact ce ati citit, astfel continuati intotdeauna de unde ati ramas. Deasemenea primiti notificari, aici sau prin email atunci se posteaza ceva nou. Puteti \"aprecia\" postari pentru a impartasi iubire :heartbeat:"},"summary":{"enabled_description":"Vizualizați sumarul discuției: cea mai interesantă postare, așa cum a fost determinată de comunitate. Pentru toate postările, faceți click dedesubt.","description":"Există \u003cb\u003e{{count}}\u003c/b\u003e de răspunsuri.","description_time":"Există \u003cb\u003e{{count}}\u003c/b\u003e de răspunsuri cu timp de citit estimat la \u003cb\u003e{{readingTime}} de minute\u003c/b\u003e.","enable":"Fă sumarul discuției","disable":"Arată toate postările"},"deleted_filter":{"enabled_description":"Această discuție conține postări șterse, ce au fost ascunse. ","disabled_description":"Postările șterse din discuție sunt vizibile.","enable":"Ascunde postările șterse","disable":"Arată postările șterse"},"private_message_info":{"title":"Mesaj","invite":"Invită alte persoane...","remove_allowed_user":"Chiar doriți să îl eliminați pe {{name}} din acest mesaj privat?"},"email":"Email","username":"Nume utilizator","last_seen":"Văzut","created":"Creat","created_lowercase":"creat","trust_level":"Nivel de încredere","search_hint":"Numele de utilizator sau email","create_account":{"title":"Crează cont","failed":"Ceva a decurs greșit, poate că acest email e deja înregistrat, încearcă linkul parolă uitată "},"forgot_password":{"title":"Resetare parolă","action":"Mi-am uitat parola","invite":"Introduce-ți numele de utilizator sau adresa de email și vă vom trimite un email pentru resetarea parolei.","reset":"Resetare Parolă","complete_username":"Dacă contul se potrivește numelui de utilizator \u003cb\u003e%{username}\u003c/b\u003e, ar trebuii să primiți un email cu instrucțiunile de resetare a parolei, în scurt timp.","complete_email":"dacă un cont se potrivește \u003cb\u003e%{email}\u003c/b\u003e, ar trebuii să primiți un email cu instrucțiunile de resetare a parolei, în scurt timp.","complete_username_found":"Am găsit un cont care se potriveşte cu utilizatorul \u003cb\u003e%{username}\u003c/b\u003e, veţi primi un email cu instrucţiunile cum să resetati parolă în cel mai scurt timp.","complete_email_found":"Am găsit un cont care se potriveşte cu adresa \u003cb\u003e%{email}\u003c/b\u003e, veţi primi un email cu instrucţiunile cum să resetati parolă în cel mai scurt timp.","complete_username_not_found":"Nici un cont nu se potriveşte cu utilizatorul \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Nici un cont nu se potriveşte adresei  \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Autentificare","username":"Utilizator","password":"Parolă","email_placeholder":"email sau nume de utilizator","caps_lock_warning":"Caps Lock este apăsat","error":"Eroare necunoscută","rate_limit":"Te rog asteapta inainte de a te reconecta.","blank_username_or_password":"Introduceți emailul sau numele de utilizator și parola.","reset_password":"Resetare parolă","logging_in":"În curs de autentificare...","or":"sau","authenticating":"Se autentifică...","awaiting_confirmation":"Contul dumneavoastră așteaptă să fie activat .Folosiți linkul de reamintire a parolei, pentru a iniția un alt email de activare.","awaiting_approval":"Contul dumneavoastră nu a fost aprobat încă de un admin . Veți primi un email când se aprobă.","requires_invite":"Ne pare rău, accesul la forum se face pe bază de invitație.","not_activated":"Nu te poți loga încă. Am trimis anterior un email de activare pentru \u003cb\u003e{{sentTo}}\u003c/b\u003e. Urmăriți instrucțiunile din email pentru a vă activa contul.","not_allowed_from_ip_address":"Nu va puteţi conecta de la această adresa de IP.","admin_not_allowed_from_ip_address":"Nu va puteţi conecta ca administrator de la această adresa de IP.","resend_activation_email":"Click aici pentru a trimite emailul de activare încă odată.","sent_activation_email_again":"Am trimis un alt email de activare pentru dvs la \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Poate dura câteva minute până ajunge; Vizitați și secțiunea de spam a mailului.","to_continue":"Te rog sa te autentifici.","preferences":"Trebuie sa fi autentificat pentru a schimba preferintele.","forgot":"Nu imi amintesc detaliile contului meu.","google":{"title":"cu Google","message":"Autentificare cu Google (Asigurați-vă că barierele de pop up nu sunt active)"},"google_oauth2":{"title":"cu Google","message":"Autentificare cu Google (Asigurați-vă că barierele de pop up nu sunt active)"},"twitter":{"title":"cu Twitter","message":"Autentificare cu Twitter (Asigurați-vă că barierele de pop up nu sunt active)"},"facebook":{"title":"cu Facebook","message":"Autentificare cu Facebook (Asigurați-vă că barierele de pop up nu sunt active)"},"yahoo":{"title":"cu Yahoo","message":"Autentificare cu Yahoo (Asigurați-vă că barierele de pop up nu sunt active)"},"github":{"title":"cu GitHub","message":"Autentificare cu GitHub (Asigurați-vă că barierele de pop up nu sunt active)"}},"apple_international":"Apple/Internaţional","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"mai multe...","options":"Optiuni","add_warning":"Această este o avertizare oficială.","posting_not_on_topic":"Cărei discuții vrei să-i răspunzi?","saving_draft_tip":"salvează...","saved_draft_tip":"salvat","saved_local_draft_tip":"salvat local","similar_topics":"discuția dvs e similară cu...","drafts_offline":"proiecte offline","error":{"title_missing":"Este nevoie de titlu","title_too_short":"Titlul trebuie sa aibă minim {{min}} de caractere","title_too_long":"Titlul nu poate avea {{max}} de caractere","post_missing":"Postarea nu poate fi gol","post_length":"Postarea trebuie sa aibă minim {{min}} de caractere","try_like":"Aţi încercat butonul \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e?","category_missing":"Trebuie să alegi o categorie"},"save_edit":"Salvează Editarea","reply_original":"Răspunde discuției originale","reply_here":"Răspunde aici","reply":"Răspunde","cancel":"Anulează","create_topic":"Crează o Discuţie","create_pm":"Mesaj","title":"sau apasă Ctrl+Enter","users_placeholder":"adaugă un utilizator","title_placeholder":"Care este tema discuției într-o singură propoziție?","edit_reason_placeholder":"de ce editați?","show_edit_reason":"(adaugă motivul editării)","reply_placeholder":"Scrie aici. Utilizeaza Markdown, BBCode or HTML la format. Trage sau lipeste imagini.","view_new_post":"Vizualizează noua postare.","saving":"Salvare","saved":"Salvat!","saved_draft":"Ai o postare în stadiul neterminat. Fă click oriunde pentru a continua editarea.","uploading":"Încarcă...","show_preview":"arată previzualizare \u0026raquo;","hide_preview":"\u0026laquo; ascunde previzualizare","quote_post_title":"Citează întreaga postare","bold_title":"Gros","bold_text":"text gros","italic_title":"Aplecare","italic_text":"text aplecat","link_title":"Adresă Hyper","link_description":"adaugă aici descrierea adresei hyper","link_dialog_title":"Introdu adresă hyper","link_optional_text":"titlu opțional","link_placeholder":"http://example.com \"text optional\"","quote_title":"Citat-bloc","quote_text":"Citat-bloc","code_title":"Text preformatat","code_text":"indentează preformatarea textului cu 4 spații","upload_title":"Încarcă","upload_description":"Introduceți aici descrierea fișierelor încărcate","olist_title":"Listă numerică","ulist_title":"Listă punctată","list_item":"conținut de listă","heading_title":"Titlu","heading_text":"Titlu","hr_title":"Regulă de ordonare orizontală","help":"Ajutor de editare","toggler":"ascunde sau arată panelul de compus","modal_ok":"Ok","modal_cancel":"Anuleaza","cant_send_pm":"Scuze,nu poti trimite mesaje catre %{username}","admin_options_title":"Setări opționale ale discuției pentru moderatori","auto_close":{"label":"Închide automat discuţia după:","error":"Introduceţi o valoare valida.","based_on_last_post":"Nu închide discuţia până când ultimul răspuns nu are o vechime de cel puţin:","all":{"examples":"Introdu numărul de ore (24), timpul absolut (17:30) sau dată şi timpul cu secunde (2013-11-22 14:00)."},"limited":{"units":"(# de ore)","examples":"Introdu numărul de ore (24)."}}},"notifications":{"title":"notifică menționarea @nume, răspunsuri la postări, discuții, mesaje private, etc","none":"Nu pot încarcă notificările în acest moment.","more":"vezi notificările mai vechi","total_flagged":"toate postările semnalate","mentioned":"\u003ci title='a menționat' class='icon'\u003e@\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='a citat' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='a răspuns' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='a răspuns' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='a editat' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='a apreciat' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='Mesaj privat' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='Mesaj privat' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='a invitat la discuţie' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='a acceptat invitația ta' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e a acceptat invitația ta\u003c/p\u003e","moved_post":"\u003ci title='postare mutată' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e mutată {{description}}\u003c/p\u003e","linked":"\u003ci title='adresă de postare' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='insignă acordată' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003e Ţi s-a acordat {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentionat de","quoted":"Citat de","replied":"Raspuns","posted":"Postat de"},"popup":{"mentioned":"{{username}} va menţionat în \"{{topic}}\" - {{site_title}}","quoted":"{{username}} va citat în\"{{topic}}\" - {{site_title}}","replied":"{{username}} va răspuns la \"{{topic}}\" - {{site_title}}","posted":"{{username}} a postal în \"{{topic}}\" - {{site_title}}","private_message":"{{username}} va trimis un mesaj privat în \"{{topic}}\" - {{site_title}}","linked":"{{username}} a făcut o legătură la post-ul dvs. din \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Adaugă o imagine","title_with_attachments":"adaugă o imagine sau un fișier","from_my_computer":"din dispozitivul meu","from_the_web":"De pe web","remote_tip":"adresă către imagine http://example.com/image.jpg","hint":"(puteți să trageți și să aruncați în editor pentru a le încărca)","uploading":"Încarcă","image_link":"Adresa din imagine va duce la"},"search":{"title":"caută discuții ,postări sau categorii","no_results":"Fără rezultat.","searching":"Caută...","post_format":"#{{post_number}} de {{username}}","context":{"user":"Caută postări după @{{username}}","category":"Caută în categoria\"{{category}}\" ","topic":"Caută în această discuție","private_messages":"Caută mesaje"}},"go_back":"înapoi","not_logged_in_user":"pagina utilizatorului cu sumarul activităților și preferințelor","current_user":"mergi la pagina proprie de utilizator","topics":{"bulk":{"reset_read":"resetează citirea","delete":"Șterge subiectele","dismiss_new":"Anulează cele noi","toggle":"activează selecția în masă pentru discuții","actions":"Acțiuni în masă","change_category":"Schimbă categoria","close_topics":"Închide discuțiile","archive_topics":"Arhivează subiectele","notification_level":"Schimbă nivelul de notificări","choose_new_category":"Alege o nouă categorie pentru această discuţie","selected":{"one":"Ai selectat \u003cb\u003eun\u003c/b\u003e subiect.","few":"Ai selectat \u003cb\u003e{{count}}\u003c/b\u003e subiecte.","other":"Ai selectat \u003cb\u003e{{count}}\u003c/b\u003e subiecte."}},"none":{"unread":"Nu aveți discuții necitite.","new":"Nu aveți discuții noi.","read":"Nu ați citit nicio discuție încă.","posted":"Nu ați postat în nicio discuție încă.","latest":"Nu există nicio discuție nouă. Trist.","hot":"Nu există nicio discuție importantă.","bookmarks":"Nu aveţi nici un semn de carte încă.","category":"Nu există nicio discuție din categoria {{category}}.","top":"Nu exită nicio discuție de top.","search":"Nu sunt rezulate la căutare.","educate":{"new":"\u003cp\u003eDiscuţiile noi vor apărea aici.\u003c/p\u003e\u003cp\u003eImplicit, discuţiile sunt considerate noi şi vor afişa indicatorul \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enew\u003c/span\u003e dacă au fost create în ultimele 2 zile.\u003c/p\u003e\u003cp\u003ePuteţi schimba aceasta în \u003ca href=\"%{userPrefsUrl}\"\u003epreferinţele\u003c/a\u003e dvs.\u003c/p\u003e"}},"bottom":{"latest":"Nu există nicio ultimă discuție.","hot":"Nu mai există discuții importante.","posted":"Nu mai există discuții postate.","read":"Nu mai există discuții citite.","new":"Nu mai există discuții noi.","unread":"Nu mai există discuții necitite.","category":"Nu mai există discuții din categoria {{category}}.","top":"Nu mai există discuții de top.","bookmarks":"Nu mai sunt semne de carte.","search":"Nu mai sunt rezultate."}},"topic":{"filter_to":"{{post_count}} de postări în discuție","create":"Crează discuție","create_long":"Crează discuție nouă","private_message":"Scrie un mesaj.","list":"Discuții","new":"discuție nouă","unread":"necitită","new_topics":{"one":"1 subiect nou","few":"{{count}} subiecte noi","other":"{{count}} subiecte noi"},"unread_topics":{"one":"1 subiect necitit","few":"{{count}} subiecte necitite","other":"{{count}} subiecte necitite"},"title":"Discuție","invalid_access":{"title":"Discuție pirvată","description":"Ne pare rău nu ai acces la acea discuție!","login_required":"Trebuie să fii autentificat să poți vedea discuția."},"server_error":{"title":"Discuția nu s-a putut încărca","description":"Ne pare rău, nu am putut încărca discuția, posibil din cauza unei probleme de conexiune. Încercați din nou. Dacă problema persistă, anunțați-ne."},"not_found":{"title":"Discuție negăsită","description":"Ne pare rău, Nu am putut găsii discuția. Poate a fost ștearsă de un moderator?"},"total_unread_posts":{"one":"aveţi 1 mesaj necitit în această discuţie.","few":"aveţi {{count}} mesaje necitite în această discuţie.","other":"aveţi {{count}} mesaje necitite în această discuţie."},"unread_posts":{"one":"aveţi 1 mesaj vechi necitit în această discuţie.","few":"aveţi {{count}} mesaje vechi necitite în această discuţie.","other":"aveţi {{count}} mesaje vechi necitite în această discuţie."},"new_posts":{"one":"este 1 mesaj nou în această discuţie de la ultima citire","few":"sunt {{count}} mesaje noi în această discuţie de la ultima citire","other":"sunt {{count}} mesaje noi în această discuţie de la ultima citire"},"likes":{"one":"este 1 apreciere pentru această discuţie","few":"sunt {{count}} aprecieri pentru această discuţie","other":"sunt {{count}} aprecieri pentru această discuţie"},"back_to_list":"Înapoi la lista de discuții","options":"Opțiunile discuției","show_links":"arată adresele din această discuție","toggle_information":"activează detaliile discuției","read_more_in_category":"Vreți să citiți mai mult? Priviți alte discuții din {{catLink}} sau {{latestLink}}.","read_more":"Vreți să citiți mai mult? {{catLink}} sau {{latestLink}}.","browse_all_categories":"Priviți toate categoriile","view_latest_topics":"priviți ultimele discuții","suggest_create_topic":"De ce să nu creați o discuție?","jump_reply_up":"răspundeți imediat","jump_reply_down":"răspundeți mai târziu","deleted":"Discuția a fost ștearsă","auto_close_notice":"Această discuție va fi inchisă în %{timeLeft}.","auto_close_notice_based_on_last_post":"Această discuţie se va închide %{duration} după ultimul răspuns.","auto_close_title":"Setările de auto-închidere","auto_close_save":"Salvează","auto_close_remove":"nu închide automat această discuție","progress":{"title":"Progresul Discuției","go_top":"capăt","go_bottom":"sfârșit","go":"mergi","jump_bottom":"sări la ultimul mesaj","jump_bottom_with_number":"sări la mesajul %{post_number}","total":"toate postările","current":"Postarea curentă","position":"postarea %{current} din %{total}"},"notifications":{"reasons":{"3_6":"Veți primii notificări fiindcă priviți această categorie.","3_5":"Veți primii notificări fiindcă ați început să citiți această discuție automat.","3_2":"Veți primii notificări fiindcă citiți această discuție.","3_1":"Veți primii notificări fiindcă ați creat această discuție.","3":"Veți primii notificări fiindcă priviți această discuție.","2_8":"Veți primii notificări fiindcă urmariți această categorie.","2_4":"Veți primii notificări fiindcă ați postat un răspuns în această discuție.","2_2":"Veți primii notificări fiindcă urmariți această discuție.","2":"Veți primii notificări fiindcă  citiți \u003ca href=\"/users/{{username}}/preferences\"\u003eaceastă discuție\u003c/a\u003e.","0_7":"Ignorați toate notificările din această categorie.","0_2":"Ignorați toate notificările din această discuție.","0":"Ignorați toate notificările din această discuție."},"watching_pm":{"title":"Privind"},"watching":{"title":"Privind"},"tracking_pm":{"title":"Urmărind"},"tracking":{"title":"Urmărind"},"muted_pm":{"title":"Silențios","description":"Nu veţi fi niciodată notificat despre acest mesaj."},"muted":{"title":"Silențios"}},"actions":{"recover":"Rescrie discuție","delete":"Șterge Discuție","open":"Deschide discuție","close":"Închide discuție","multi_select":"Selectează discuţiile ...","auto_close":"Închide automat","pin":"Fixează discuţia pe pagină...","unpin":"Anulează fixarea discuției","unarchive":"Dezarhivează discuția","archive":"Arhivează discuția","invisible":"Fă invizibil","visible":"Fă vizibil","reset_read":"Resetează informația citită"},"feature":{"pin":"Fixează discuţia pe pagină...","unpin":"Anulează fixarea discuției","pin_globally":"Fixează discuţia pe site...","make_banner":"Marchează discuție","remove_banner":"Demarchează discuție"},"reply":{"title":"Răspunde","help":"începe să compui un răspuns pentru această discuție"},"clear_pin":{"title":"Înlătură fixarea","help":"Înlătură statutul de fix al acestei discuții pentru a nu mai apărea în vârful listei de discuții"},"share":{"title":"Distribuie","help":"distribuie o adresă acestei discuții"},"flag_topic":{"title":"Marcheză","help":"marchează privat această discuție pentru atenție sau trimite o notificare privată despre ea","success_message":"Ai marcat cu succes această discuție."},"feature_topic":{"title":"Promovează această discuţia","confirm_pin":"Aveţi deja {{count}} discuţii promovate. Prea multe discuţii promovate pot fi deveni o problemă pentru utilizatorii noi sau anonimi. Sunteţi sigur că vrei să promovaţi o altă discuţie în această categorie?","unpin":"Îndepărtează aceast mesaje din top-ul categoriei {{categoryLink}}","pin_note":"Utilizatorii pot anula fixarea unui subiect individual pentru ei înșiși.","confirm_pin_globally":"Aveţi deja {{count}} discuţii promovate la nivel global. Prea multe discuţii promovate pot fi deveni o problemă pentru utilizatorii noi sau anonimi. Sunteţi sigur că vrei să promovaţi o altă discuţie la nivel global?","unpin_globally":"Eliminați acest subiect din partea de sus a tuturor listelor de discuţii.","global_pin_note":"Utilizatorii pot anula fixarea unui subiect individual pentru ei înșiși.","make_banner":"Transformă acest subiect într-un banner care apare în partea de sus a tuturor paginilor.","remove_banner":"Îndepărtaţi mesajul banner care apare în partea de sus a fiecărei pagini.","banner_note":"Utilizatorii pot îndepărta baner-ul închizându-l. Doar un singur mesaj poate fi folosit că bane într-un moment dat."},"inviting":"Invită...","automatically_add_to_groups_optional":"Aceasta invitație include și accesul la grupurile: (opțional, doar admin)","automatically_add_to_groups_required":"Aceasta invitație include și accesul la grupurile: (\u003cb\u003eNeapărat\u003c/b\u003e, doar admin)","invite_private":{"title":"Invită la mesaj privat","email_or_username":"adresa de Email sau numele de utilizator al invitatului","email_or_username_placeholder":"adresa de email sau numele utilizatorului","action":"Invită","success":"Am invitat acest utilizator să participe la acest mesaj.","error":"Ne pare rău, s-a întâmpinat o eroare la trimiterea invitației către acel utilizator.","group_name":"numele grupului"},"invite_reply":{"title":"Invitație","username_placeholder":"nume utilizator","action":"Trimite o invitație","help":"invită alţi utilizatori la această discuţie via email sau notificare","to_forum":"Vom trimite un email scurt permițând prietenilor dumneavoastră să participe făcând click pe o adesă, nu necesită autentificare.","sso_enabled":"Introduceţi numele de utilizator al persoanei pe care doriţi să o invitaţi la acesta discuţie.","to_topic_blank":"Introduceţi numele de utilizator sau adresa de email a persoanei pe care doriţi să o invitaţi la acesta discuţie.","to_topic_email":"Aţi introdus o adresa de e-mail. Vom trimite via email o invitaţie, care permite prietenul dvs. să răspundă imediat la această discuţie.","email_placeholder":"exemplu@nume.com","success_email":"Am trimis o invitaţie către \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e.. Va vom anunţă când invitaţia este folosită. Verificaţi fila invitaţii pe pagină dvs. de utilizator pentru a monitoriza invitaţiile. ","success_username":"Am invitat acest utilizator să participe la această discuţie.","error":"Ne pare rău, nu am putut invită persoană indicată. Poate că a fost deja invitată? (Invitaţiile sunt limitate)"},"login_reply":"Autentifică-te pentru a răspunde.","filters":{"n_posts":{"one":"1 mesaj","few":"{{count}} postări","other":"{{count}} postări"},"cancel":"Arată din nou toate postările din această discuție."},"split_topic":{"title":"Mutare în discuție nouă ","action":"mută în discuție nouă","topic_name":"Numele noii discuții","error":"S-a semnalat o eroare la mutarea postărilor către discuția nouă.","instructions":{"one":"Veţi crea o nouă discuţie care va fi populată cu postarea selectată.","few":"Veţi crea o nouă discuţie care va fi populată cu cele \u003cb\u003e{{count}}\u003c/b\u003e postări selectate.","other":"Veţi crea o nouă discuţie care va fi populată cu cele \u003cb\u003e{{count}}\u003c/b\u003e postări selectate."}},"merge_topic":{"title":"Mută în discuție existentă","action":"mută în discuție existentă","error":"S-a semnalat o eroare la mutarea postărilor în acea discuție.","instructions":{"one":"Vă rugăm să alegeţi discuţia unde doriţi să mutaţi acest mesaj.","few":"Vă rugăm să alegeţi discuţia unde doriţi să mutaţi aceste \u003cb\u003e{{count}}\u003c/b\u003e mesaje.","other":"Vă rugăm să alegeţi discuţia unde doriţi să mutaţi aceste \u003cb\u003e{{count}}\u003c/b\u003e mesaje."}},"change_owner":{"title":"Schimbă deținătorul postărilor","action":"Schimbă apartenența","error":"S-a semnalat o eroare la schimbarea apartenenței postărilor.","label":"Noul deținător al postărilor","placeholder":"numele de utilizator al deținătorului","instructions":{"one":"Va rugăm să alegeţi noul propietar pentru mesajul postat de \u003cb\u003e{{old_user}}\u003c/b\u003e.","few":"Va rugăm să alegeţi noul propietar pentru cele {{count}} mesajele postate de \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Va rugăm să alegeţi noul propietar pentru cele {{count}} mesajele postate de \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":" aveți în vedere că nicio notificare ce privește această postare nu va fi transferabilă retroactiv către noul utilizator.\u003cbr\u003eAvertisment: Acum, nicio informație ce depinde de postare nu va fi transferată noului utilizator. Folosiți cu grijă."},"multi_select":{"select":"selectează","selected":"selectate ({{count}})","select_replies":"selectează +răspunsuri","delete":"șterge selecția","cancel":"anularea selecției","select_all":"selectează tot","deselect_all":"deselectează  tot","description":{"one":"Aţi selectat \u003cb\u003e1\u003c/b\u003e mesaj.","few":"Aţi selectat \u003cb\u003e{{count}}\u003c/b\u003e mesaje.","other":"Aţi selectat \u003cb\u003e{{count}}\u003c/b\u003e mesaje."}}},"post":{"quote_reply":"răspunde prin citat","edit":"Editează {{link}} {{replyAvatar}} {{username}}","edit_reason":"Motivul: ","post_number":"postarea {{number}}","last_edited_on":"postare editată ultima oară la","reply_as_new_topic":"Răspunde cu o discuție nouă","continue_discussion":"Continuă discuția de la {{postLink}}:","follow_quote":"mergi la postarea citată","show_full":"Arată postarea în întregime","show_hidden":"Arată conținut ascuns.","deleted_by_author":{"one":"(post retras de autor, va fi şters automat în %{count} ore, cu excepţia cazului în care mesajul este marcat)","few":"(postări retrase de autor, vor fi şterse automat în %{count} ore, cu excepţia cazului în care mesajele sunt marcate)","other":"(postări retrase de autor, vor fi şterse automat în %{count} ore, cu excepţia cazului în care mesajele sunt marcate)"},"expand_collapse":"expandează/restrânge","gap":{"one":"vedeţi 1 răspuns ascuns","few":"vedeţi {{count}} răspunsuri ascunse","other":"vedeţi {{count}} răspunsuri ascunse"},"more_links":"{{count}} mai multe...","unread":"postarea nu a fost citită","errors":{"create":"Ne pare rău , s-a semnalat o eroare în creerea postării dumneavoastră.Vă rugăm încercati iar.","edit":"Ne pare rău , s-a semnalat o eroare în editarea postării dumneavoastră . Vă rugăm încercati iar.","upload":"Ne pare rău ,s-a semnalat o eroare în încarcarea acelui fișier. Vă rugăm încercati iar.","attachment_too_large":"Ne pare rău, fișierul pe care-l încarcați este prea mare (marimea maximă este de {{max_size_kb}}kb).","file_too_large":"Ne pare rău, fişierul pe care încercaţi să îl încărcaţi este prea mare (mărimea maximă este de {{max_size_kb}}kb)","too_many_uploads":"Ne pare rău, puteți încarca doar cate un fișier.","too_many_dragged_and_dropped_files":"Ne pare rău, dar nu puteţi trage mai mult de 10 fişiere în acelaşi timp.","upload_not_authorized":"Ne pare rău, fișierul pe care-l încarcați nu este autorizat (extensia pentru autorizare: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Ne pare rău, noul utilizator nu poate încarca imagini.","attachment_upload_not_allowed_for_new_user":"Ne pare rău, noul utilizator nu poate încarca atașamnete.","attachment_download_requires_login":"Ne pare rău, dar trebuie să fiţi autentificat pentru a descarcă ataşamentele."},"abandon":{"confirm":"Sunteți sigur că doriți să abandonați postarea?","no_value":"Nu, pastrează","yes_value":"Da, abandonează"},"via_email":"acest post a sosit via email","wiki":{"about":"Acest post este un wiki; oricine poate edita"},"archetypes":{"save":"Opțiuni de salvare"},"controls":{"reply":"începe compunerea unui răspuns pentru această postare","like":"apreciează acestă postăre","has_liked":"ai retras aprecierea acestei postări ","undo_like":"anuleazaă aprecierea","edit":"editează această postare","edit_anonymous":"Ne pare rău, dar trebuie să fiţi autentificat pentru a edita.","flag":"marchează privat această postare pentru atenție sau trimite o notificare privată despre aceasta","delete":"șterge această postare","undelete":"rescrie această postare","share":"distribuie adresa către această postare","more":"Mai mult","delete_replies":{"confirm":{"one":"Doriţi să ştergeţi răspunsul direct la acest mesaj?","few":"Doriţi să ştergeţi cele {{count}} răspunsuri directe la acest mesaj?","other":"Doriţi să ştergeţi cele {{count}} răspunsuri directe la acest mesaj?"},"yes_value":"Da, șterge și răspunsurile","no_value":"Nu, doar postarea"},"admin":"acțiuni administrative de postare","wiki":"Fă postarea Wiki","unwiki":"Anulează stadiul de wiki al postării","convert_to_moderator":"Adaugă culoarea personalului","revert_to_regular":"Sterge culoarea personalului","rebake":"Reconstruieşte HTML","unhide":"Arată"},"actions":{"flag":"Semnal","defer_flags":{"one":"Marcat pentru amânare.","few":"Marcate pentru amânare.","other":"Marcate pentru amânare."},"it_too":{"off_topic":"Și semnalează","spam":"Și semnalează","inappropriate":"Și semnalează","custom_flag":"Și semnalează","bookmark":"și marchează","like":"Și acordă-i apreciere ","vote":"Și votează pentru"},"undo":{"off_topic":"Retrage semnalare","spam":"Retrage semnalare","inappropriate":"Retrage semnalare","bookmark":"Retrage marcare","like":"Retrage apreciere","vote":"Retrage vot"},"people":{"off_topic":"{{icons}} Semnalază asta ca în afara discuției","spam":"{{icons}} Semnalează asta ca spam","spam_with_url":"{{icons}} semnalează \u003ca href='{{postUrl}}'\u003eca spam\u003c/a\u003e","inappropriate":"{{icons}} Semnalează asta ca necorespunzator","notify_moderators":"{{icons}} moderatorii notificați","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003e moderatori notificați\u003c/a\u003e","notify_user":"{{icons}} a trimis un mesaj","notify_user_with_url":"{{icons}} a trimis un \u003ca href='{{postUrl}}'\u003emesaj\u003c/a\u003e","bookmark":"{{icons}} marchează asta","like":"{{icons}} apreciat","vote":"{{icons}} votat"},"by_you":{"off_topic":"Ați marcat ca fiind în afara discutiei","spam":"Ați marcat ca fiind spam","inappropriate":"Ați marcat ca necorespunzator","notify_moderators":"Ați marcat pentru a fi moderată","notify_user":"Aţi trimis un mesaj către acest utilizator","bookmark":"Ați marcat ca semn de carte această postare","like":"Ați apreciat","vote":"Ați votat aceasta postare"},"by_you_and_others":{"off_topic":{"one":"Dvs. şi încă o persoană aţi marcat acest mesaj ca fiind în afară discuţiei.","few":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj ca fiind în afară discuţiei.","other":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj ca fiind în afară discuţiei."},"spam":{"one":"Dvs. şi încă o persoană aţi marcat acest mesaj ca spam. ","few":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj ca spam. ","other":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj ca spam. "},"inappropriate":{"one":"Dvs. şi încă o persoană aţi marcat acest mesaj ca inadecvat. ","few":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj ca inadecvat. ","other":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj ca inadecvat. "},"notify_moderators":{"one":"Dvs. şi încă o persoană aţi marcat acest mesaj pentru moderare.","few":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj pentru moderare.","other":"Dvs. şi alte {{count}} persoane aţi marcat acest mesaj pentru moderare."},"notify_user":{"one":"Dvs. şi încă o persoană aţi trimis un mesaj către acest utilizator.","few":"Dvs. şi alte {{count}} persoane aţi trimis un mesaj către acest utilizator.","other":"Dvs. şi alte {{count}} persoane aţi trimis un mesaj către acest utilizator."},"bookmark":{"one":"Dvs. şi încă o persoană aţi pus un semn de carte pentru această postare.","few":"Dvs. şi alte {{count}} persoane aţi pus un semn de carte pentru această postare.","other":"Dvs. şi alte {{count}} persoane aţi pus un semn de carte pentru această postare."},"like":{"one":"Dvs. şi încă o persoană aţi apreciat aceasta.","few":"Dvs. şi alte {{count}} persoane aţi apreciat aceasta.","other":"Dvs. şi alte {{count}} persoane aţi apreciat aceasta."},"vote":{"one":"Dvs. şi încă o persoană aţi votat pentru această postare.","few":"Dvs. şi alte {{count}} persoane aţi votat pentru această postare.","other":"Dvs. şi alte {{count}} persoane aţi votat pentru această postare."}},"by_others":{"off_topic":{"one":"1 persoană a marcat acesta ca fiind în afară discuţiei","few":"{{count}} persoane au marcat acesta ca fiind în afară discuţiei","other":"{{count}} persoane au marcat acesta ca fiind în afară discuţiei"},"spam":{"one":"1 persoană a marcat acesta ca spam","few":"{{count}} persoane au marcat acesta ca spam","other":"{{count}} persoane au marcat acesta ca spam"},"inappropriate":{"one":"o persoană a marcat acesta ca inadecvat","few":"{{count}} persoane au marcat acesta ca inadecvat","other":"{{count}} persoane au marcat acesta ca inadecvat"},"notify_moderators":{"one":"o persoană a marcat acest mesaj pentru moderare","few":"{{count}} persoane au marcat acest mesaj pentru moderare","other":"{{count}} persoane au marcat acest mesaj pentru moderare"},"notify_user":{"one":"o persoană a trimis un mesaj către acest utilizator","few":"{{count}} au trimis un mesaj către acest utilizator","other":"{{count}} au trimis un mesaj către acest utilizator"},"bookmark":{"one":"o persoană a pus un semn de carte la acest mesaj","few":"{{count}} persoane au pus un semn de carte la acest mesaj","other":"{{count}} persoane au pus un semn de carte la acest mesaj"},"like":{"one":"o persoană a apreciat aceasta","few":"{{count}} persoane au apreciat aceasta","other":"{{count}} persoane au apreciat aceasta"},"vote":{"one":"o persoană a votat pentru acest mesaj","few":"{{count}} persoane au votat pentru acest mesaj","other":"{{count}} persoane au votat pentru acest mesaj"}}},"delete":{"confirm":{"one":"Sunteți sigur că vreți să ștergeți acest mesaj?","few":"Sunteți sigur că vreți să ștergeți toate aceste mesaje?","other":"Sunteți sigur că vreți să ștergeți toate aceste mesaje?"}},"revisions":{"controls":{"first":"Prima revizie","previous":"Revizie precedentă","next":"Urmatoarea revizie","last":"Ultima revizie","hide":"Ascunde revizia","show":"Afișează revizia","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Arată rezultatul randării cu adăugări și proprietăți","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Arată proprietățile rezultatului randării una lângă alta","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Arată sursa de marcare a proprietăților una lângă alta","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Markdown"}}}},"category":{"can":"can\u0026hellip; ","none":"(nicio categorie)","choose":"Selectează o categorie\u0026hellip;","edit":"editează","edit_long":"Editează","view":"Arată discuțiile în categorie","general":"General","settings":"Setări","delete":"Șterge categorie","create":"Crează categorie","save":"Salvează categorie","slug":"Slug Categorie","slug_placeholder":"(Opțional) cuvinte-punctate pentru url","creation_error":"S-a semnalat o eroare în timpul creării categoriei.","save_error":"S-a semnalat o eroare in timpul salvării categoriei.","name":"Numele categoriei","description":"Descriere","topic":"Topicul categoriei","logo":"Imaginea Logo a categoriei","background_image":"Imaginea de fundal a categoriei","badge_colors":"Culorile insignei","background_color":"Culoarea de fundal","foreground_color":"Culoarea de prim-plan","name_placeholder":"Unul sau doua cuvinte maximum","color_placeholder":"Orice culoare","delete_confirm":"Sigur doriți să ștergeți această categorie?","delete_error":"S-a semnalat o eroare la ștergerea acestei categorii.","list":"Lista categorii","no_description":"Va rugăm adăugați o descriere acestei categorii.","change_in_category_topic":"Editează descrierea","already_used":"Această culoare este folosită la o altă categorie","security":"Securitate","images":"Imagini","auto_close_label":"Auto-inchide discuțiile după:","auto_close_units":"ore","email_in":"Adresa email de primire preferențială:","email_in_allow_strangers":"Acceptă emailuri de la utilizatori anonimi fară cont","email_in_disabled":"Postarea discuțiilor noi prin email este dezactivată din setările siteului. Pentru a activa postarea discuțiilor noi prin email,","email_in_disabled_click":"activarea setării \"primire email \".","allow_badges_label":"Permite acordarea de insigne în această categorie","edit_permissions":"Editează Permisiuni","add_permission":"Adaugă Permisiune","this_year":"anul acesta","position":"poziție","default_position":"Poziție inițială","position_disabled":"Categoriile vor fi afișate în ordinea activitații. Pentru a controla ordinea categoriilor în listă, ","position_disabled_click":"activeaza setarea \"poziția fixa a categoriei\".","parent":"Categoria parinte","notifications":{"watching":{"title":"Vizualizare"},"tracking":{"title":"Urmărire"},"muted":{"title":"Silențios"}}},"flagging":{"title":"De ce marcați această postare ca fiind privată?","private_reminder":"steagurile sunt private, vizibile  \u003cb\u003enumai\u003c/ b\u003e personalului","action":"Marcare","take_action":"Actionează","notify_action":"Mesaj","delete_spammer":"Șterge spammer","delete_confirm":"Sunteți pe punctul de a șterge postarea \u003cb\u003e%{posts}\u003c/b\u003e și postările \u003cb\u003e%{topics}\u003c/b\u003e ale acestui uitilizator, de a-i anula contul, de a-i bloca autentificarea de la adresa IP \u003cb\u003e%{ip_address}\u003c/b\u003e, adresa de email \u003cb\u003e%{email}\u003c/b\u003e și de a bloca listarea permanent. Sunteți sigur ca acest utilizator este un spammer?","yes_delete_spammer":"Da, Șterge spammer","ip_address_missing":"(N/A)","hidden_email_address":"(ascuns)","submit_tooltip":"Acceptă marcarea privată","take_action_tooltip":"Accesati permisiunea marcarii imediat, nu mai asteptati alte marcaje comune","cant":"Ne pare rău nu puteți marca această postare deocamdată.","formatted_name":{"off_topic":"În afară discuției","inappropriate":"Inadecvat","spam":"Este Spam"},"custom_placeholder_notify_user":"De ce această postare necesită comunicarea cu utilizatorul directă sau privată? Fiți specific, constructiv și intotdeauna amabil.","custom_placeholder_notify_moderators":"De ce această postare necesită atenția moderatorului? Spuneți-ne exact ceea ce vă nelamurește, și oferiți adrese relevante de câte ori e posibil.","custom_message":{"at_least":"introduce-ți cel puțin {{n}} de caractere","more":"încă...{{n}} caractere","left":"au mai rămas {{n}} caractere"}},"flagging_topic":{"title":"De ce marcați privat această discuție?","action":"Marchează discuție","notify_action":"Mesaj"},"topic_map":{"title":"Sumarul discuției","participants_title":"Posteri Frecvenţi","links_title":"Legături Populare","links_shown":"arată toate {{totalLinks}} de adrese...","clicks":{"one":"1 click","few":"%{count} click-uri","other":"%{count} click-uri"}},"topic_statuses":{"warning":{"help":"Aceasta este o avertizare oficială."},"bookmarked":{"help":"Aţi pus un semn de carte pentru această discuţie"},"locked":{"help":"Această discuție este închisă; nu mai acceptă răspunsuri noi"},"archived":{"help":"Această discuție a fost arhivată; Este închetată și nu poate fi editată"},"unpinned":{"title":"Desprinde","help":"Această discuţie va fi afişată în ordinea iniţială, nici un mesaj nu este promovat la inceputul listei."},"pinned_globally":{"title":"Fixată Global"},"pinned":{"title":"Fixată","help":"Aceast mesaj va fi promovat. Va fi afişat la începutul discuţiei."},"invisible":{"help":"Această discuție este invizibilă; nu va fi afișată în listele de discuții și va fi accesată numai prin adresa directă"}},"posts":"Postări","posts_lowercase":"postări","posts_long":"sunt {{number}} de postări în această discuție","original_post":"Postări originale","views":"Vizualizări","views_lowercase":{"one":"vizualizare","few":"vizualizări","other":"vizualizări"},"replies":"Răspunsuri","views_long":"această discuție a fost vizualizată de {{number}} de ori","activity":"Activitate","likes":"Aprecieri","likes_lowercase":{"one":"apreciere","few":"aprecieri","other":"aprecieri"},"likes_long":"sunt {{number}} de aprecieri în această discuție","users":"Utilizatori","users_lowercase":{"one":"utilizator","few":"utilizatori","other":"utilizatori"},"category_title":"Categorie","history":"Istoric","changed_by":"de {{author}}","raw_email":{"title":"Email","not_available":"Indisponibil!"},"categories_list":"Listă categorii","filters":{"with_topics":"%{filter} Discuții","with_category":"%{filter} %{category} discuții","latest":{"help":"Discuții cu postări recente"},"hot":{"title":"Interesant","help":"o selecție a discuțiilor interesante"},"read":{"title":"Citite","help":"Discuții citite, în ordinea cronologică a citirii"},"search":{"title":"Caută","help":"caută în toate discuțiile"},"categories":{"title":"Categorii","title_in":"Categoria - {{categoryName}}","help":"toate discuțiile grupate pe categorii"},"unread":{"help":"discuțiile pe care le vizualizați sau urmariți momentan ce includ postări necitite"},"new":{"lower_title":"noi","help":"discuții create în ultimele zile"},"posted":{"title":"Postările mele","help":"discuții în care ați postat"},"bookmarks":{"title":"Semne de carte","help":"discuții cu semne de carte"},"category":{"help":"discuțiile recente din categoria {{categoryName}}"},"top":{"title":"Top","help":"o selecție a celor mai bune discuții din ultimul an, lună sau zi","all":{"title":"Dintotdeauna"},"yearly":{"title":"Anual"},"monthly":{"title":"Lunar"},"weekly":{"title":"Săptămânal"},"daily":{"title":"Zilnic"},"all_time":"Dintotdeauna","today":"Astăzi"}},"browser_update":"Din nefericire, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003e browserul dumneavoastră este prea vechi pentru a funcționa pe acest forum \u003c/a\u003e. Va rugăm \u003ca href=\"http://browsehappy.com\"\u003e reânoiți browserul\u003c/a\u003e.","permission_types":{"full":"Crează / Răspunde / Vizualizează","create_post":"Răspunde / Vizualizaează","readonly":"Vizualizaează"},"poll":{"average_rating":"Media: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"between_min_and_max_options":"Puteţi alege între \u003cstrong\u003e%{min}\u003c/strong\u003e şi \u003cstrong\u003e%{max}\u003c/strong\u003e opţiuni."}},"cast-votes":{"title":"Exprimaţi-vă votul","label":"Votează acum!"},"show-results":{"title":"Afişează rezultatele sondajului","label":"Afișare rezultate"},"hide-results":{"title":"Înapoi la votul dvs.","label":"Ascunde rezultate"},"open":{"title":"Deschide sondaj","label":"Deschis","confirm":"Sunteţi sigur că doriţi să deschideţi acest sondaj?"},"close":{"title":"Închide sondaj","label":"Închis","confirm":"Sunteţi sigur că vreţi să închideţi acest sondaj?"},"error_while_toggling_status":"A apărut o eroare în timpul schimbării stării acestui sondaj.","error_while_casting_votes":"A apărut o eroare în timpul exprimării votului dvs."},"type_to_filter":"tastează pentru a filtra...","admin":{"title":"Discurs Admin","moderator":"Moderator","dashboard":{"title":"Spațiu de lucru","last_updated":"Actualizările spațiului de lucru:","version":"Versiune","up_to_date":"Sunteți la zi!","critical_available":"O actualizare importantă este valabilă.","updates_available":"Actualizări sunt disponibile.","please_upgrade":"Vă rugăm upgradați!","no_check_performed":"O căutare a actualizărilor nu a fost făcută. Asigurați-vă că sidekiq este pornit.","stale_data":"O căutare a actualizărilor nu a fost făcută în ultimul timp. Asigurați-vă că sidekiq este pornit.","version_check_pending":"Se pare că ați actualizat recent. Fantastic!","installed_version":"Instalat","latest_version":"Ultima","problems_found":"Ceva probleme s-au întâmpinat la instalarea discursului:","last_checked":"Ultima dată verificat","refresh_problems":"Reîmprospătează","no_problems":"Nicio problemă semnalată.","moderators":"Moderatori:","admins":"Admini:","blocked":"Blocați:","suspended":"Suspendați:","private_messages_short":"Msgs","private_messages_title":"Mesaje","space_free":"{{size}} liber","uploads":"încărcări","backups":"salvări","traffic_short":"trafic","traffic":"Cereri web","page_views":"Cereri API","page_views_short":"Cereri API","show_traffic_report":"Arată Raportul de Trafic detaliat","reports":{"today":"astăzi","yesterday":"Ieri","last_7_days":"din ultimele 7 zile","last_30_days":"din ultimele 30 de zile","all_time":"Din totdeauna","7_days_ago":"Acum 7 zile","30_days_ago":"Acum 30 de zile","all":"Toate","view_table":"Arată ca tabel","view_chart":"Diagramă cu bare","refresh_report":"Reactualizează Raportul","start_date":"Data de început ","end_date":"Data de sfârşit"}},"commits":{"latest_changes":"Ultimele schimbări: Vă rugăm reactualizați des!","by":"de către"},"flags":{"title":"Marcaje","old":"Vechi","active":"Active","agree":"De acord","agree_title":"Confirmă acest marcaj ca valid și corect","agree_flag_modal_title":"De acord și...","agree_flag_hide_post":"De acord (ascunde postarea + trimite MP)","agree_flag_hide_post_title":"Ascunde acest post şi trimite un mesaj urgent utilizatorului să îl editeze.","agree_flag_restore_post":"De acord (restaurare post)","agree_flag_restore_post_title":"Restaurează acest post","agree_flag":"De acord cu marcarea","agree_flag_title":"De acord cu marcarea și menține postarea neschimbată","defer_flag":"Amânare","defer_flag_title":"Scoate marcajul; Nu necesită o acțiune deocamdată.","delete":"Ștergere","delete_title":"Șterge postarea la care face referința marcajul.","delete_post_defer_flag":"Șterge postarea și renunță la marcaj","delete_post_defer_flag_title":"Șterge postarea; dacă este prima, șterge discuția","delete_post_agree_flag":"Șterge postarea și aprobă marcajul","delete_post_agree_flag_title":"Șterge postarea; dacă este prima, sterge discuția","delete_flag_modal_title":"Ștergere și...","delete_spammer":"Ștergere Spammer","delete_spammer_title":"Șterge utilizatorul , postările și discuțiile acestuia.","disagree_flag_unhide_post":"Nu sunt de acord (arată postarea)","disagree_flag_unhide_post_title":"Înlătură orice marcaj din postare și fă postarea din nou vizibilă","disagree_flag":"Nu sunt de acord","disagree_flag_title":"Refuză marcaj, acesta fiind invalid sau incorect","clear_topic_flags":"Terminat","clear_topic_flags_title":"Discuția a fost analizată iar problema rezolvată. Face-ți click pe Terminat pentru a înlătura marcajul.","more":"(detalii...)","dispositions":{"agreed":"de acord","disagreed":"Nu sunt de acord","deferred":"amânat"},"flagged_by":"Marcat de către","resolved_by":"Resolvat de către","took_action":"A luat măsuri","system":"Sistem","error":"Ceva a nu a funcționat","reply_message":"Răspunde","no_results":"Nu există marcaje.","topic_flagged":"Această \u003cstrong\u003ediscuție\u003c/strong\u003e a fost marcată.","visit_topic":"Vizualizați discuția pentru a acționa.","was_edited":"Mesajul a fost editat după primul semn","previous_flags_count":"Acest mesaj a fost deja marcat de {{count}} ori.","summary":{"action_type_3":{"one":"în afară discuţiei","few":"în afară discuţiei x{{count}}","other":"în afară discuţiei x{{count}}"},"action_type_4":{"one":"inadecvat","few":"inadecvat x{{count}}","other":"inadecvat x{{count}}"},"action_type_6":{"one":"personalizat","few":"personalizat x{{count}}","other":"personalizat x{{count}}"},"action_type_7":{"one":"personalizat","few":"personalizat x{{count}}","other":"personalizat x{{count}}"},"action_type_8":{"one":"spam","few":"spam x{{count}}","other":"spam x{{count}}"}}},"groups":{"primary":"Grup primar","no_primary":"(nu există grup primar)","title":"Grupuri","edit":"Editează  Grupuri","refresh":"Reîmprospătează","new":"Noi","selector_placeholder":"adaugă utilizatori","name_placeholder":"Numele grupului, fără spații, asemenea regulii de utilizator","about":"Editează aici apartentența la grupuri și numele","group_members":"Membrii grupului","delete":"Ștergere","delete_confirm":"Șterg acest grup?","delete_failed":"Imposibil de șters grupul. Dacă este unul automat, nu se poate șterge.","delete_member_confirm":"Şterge '%{username}' din grupul '%{group}'?","name":"Nume","add":"Adaugă","add_members":"Adaugă membri","custom":"Personalizat","automatic":"Automat","automatic_membership_email_domains":"Utilizatorii care se înregistrează cu un domeniu de email care se potriveşte cu unul din lista va fi adăugat automat în aces grup:","automatic_membership_retroactive":"Aplicaţi aceeaşi regulă pentru domeniul de email pentru a adaugă utilizatorii existenţi","default_title":"Titlu automat pentru toţi utilizatorii din acest grup","primary_group":"Setează automat că grup primar"},"api":{"generate_master":"Generează cheie API principală","none":"Nu sunt chei API principale active deocamdată.","user":"Utilizator","title":"API","key":"Cheie API","generate":"Generează","regenerate":"Regenerează","revoke":"Revocare","confirm_regen":"Sunteți sigur ca doriți să înlocuiți această cheie API cu una nouă?","confirm_revoke":"Sunteți sigur ca doriți să revocați acea cheie?","info_html":"Cheia dumneavoastră API vă permite să creați și să actualizați discuții folosind sintaxa JSON.","all_users":"Toți utilizatorii","note_html":"Păstrează această cheie \u003cstrong\u003esecretă\u003c/strong\u003e, toți utilizatorii ce o detin pot crea  postări arbitrare pe forum ca oricare alt utilizator."},"plugins":{"title":"Plugin-uri","installed":"Plugin-uri instalate","name":"Nume","none_installed":"Nu aveţi nici un plugin instalat.","version":"Versiune","change_settings":"Schimbă Setările","howto":"Cum instalez un plugin?"},"backups":{"title":"Rezervare","menu":{"backups":"Rezerve","logs":"Rapoarte"},"none":"Nicio rezervare valabilă.","read_only":{"enable":{"title":"Activearea modul doar-citire","label":"Activează modul doar-citire","confirm":"sunteți sigur că doriți să activați modul doar ctire?"},"disable":{"title":"Dezactivearea modului doar-citire","label":"Dezactivează modul doar-citire"}},"logs":{"none":"Nu exista rapoarte..."},"columns":{"filename":"Numele fișierului","size":"Mărime"},"upload":{"label":"Încarcă","title":"Încarcă o copie de siguranţă în această instanţa.","uploading":"ÎNCARCĂ","success":"fișierul '{{filename}}' a fost încărcat cu succes.","error":"S-a semnalat o eroare la încărcarea fișierului '{{filename}}': {{message}}"},"operations":{"is_running":"O altă operație este în desfășurare...","failed":"operația {{operation}} nu s-a finalizat. Vă rugăm verificați rapoartele.","cancel":{"label":"Anulează","title":"Anulează operația curentă","confirm":"Sunteți sigur că doriți să anulati operația curentă?"},"backup":{"label":"Salvare de siguranţă","title":"Creați o rezervă","confirm":"Sunteți sigur că doriți să creați o nouă rezervă?","without_uploads":"Da (nu include fişierele)"},"download":{"label":"Descarcă","title":"Downloadează brezervă"},"destroy":{"title":"Sterge rezervă","confirm":"Sunteți sigur că doriți să distrugeți această rezervă ?"},"restore":{"is_disabled":"Restabilirea este dezactivată din setările siteului.","label":"Restaurează","title":"Restabilește rezervă","confirm":"Sunteți sigur că doriți restabilirea acestei rezerve?"},"rollback":{"label":"Revenire la situaţia anterioară","title":"Restabilește baza de date în stadiul anterior","confirm":"Sunteți sigur că doriți restabilirea bazei de date în stadul precedent?"}}},"export_csv":{"user_archive_confirm":"Sunteţi sigur că doriţi să descărcaţi mesajele dvs.?","success":"Exportul a fost iniţiat. Veţi primi un mesaj de notificare când procesul se va termina.","failed":"Exportul a eşuat. Va rugăm verificaţi jurnalul.","rate_limit_error":"Postările pot fi descărcate doar o singură dată pe zi. Va rugăm încercaţi mâine.","button_text":"Exportă","button_title":{"user":"Exportă lista totală a utilizatorilor în formatul CSV.","staff_action":"Exportă jurnalul de acțiuni a conducerii în formatul CSV.","screened_email":"Exportă lista totală a adreselor de email verificate în format CSV.","screened_ip":"Exportă lista totală a adreselor de IP verificate în format CSV.","screened_url":"Exportă lista totală a adreselor URL verificate în format CSV."}},"invite":{"button_text":"Trimite o invitație","button_title":"Trimite o invitație"},"customize":{"title":"Modifică","long_title":"Modificarea Site-ului","css":"Foaie de stil","header":"Titlu","top":"Top","footer":"Subsol","head_tag":{"text":"\u003c/head\u003e","title":"HTML care va fi inserat înaintea de tag-ul \u003c/head\u003e"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML care va fi inserat înaintea de tag-ul \u003c/body\u003e"},"override_default":"Nu include foaia de stil standard","enabled":"Activat?","preview":"previzualizează","undo_preview":"înlaturș previzualizarea","rescue_preview":"stilul predefinit","explain_preview":"Vizualizează site-ul cu foaia de stil predefinită","explain_undo_preview":"Înapoi la foaia de stil preferentială activată momentan","explain_rescue_preview":"Vizualizeaza site-ul cu foaia de stil predefinită","save":"Salvează","new":"Nou","new_style":"Stil nou","delete":"Șterge","delete_confirm":"Șterge aceste preferințe?","about":"Modifică foaia de stil CSS și capetele HTML Modify CSS din site. Adaugă o preferința pentru a începe.","color":"Culoare","opacity":"Opacitate","copy":"Copiază","css_html":{"title":"CSS/HTML","long_title":"Customizarile CSS and HTML"},"colors":{"title":"Culori","long_title":"Tabel culori","about":"Modifică culorile folosite în site fară a scrie CSS. Adaugă un nou aranjament pentru a începe.","new_name":"O un nou aranjament pentru culori","copy_name_prefix":"Copiază","delete_confirm":"Șterge acest aranjament de culori?","undo":"rescrie","undo_title":"Rescrie schimbările acestei culori de ultima oară când a fost salvată.","revert":"refacere","revert_title":"Resetează culoarea la stadiul aranjamentului predefinit .","primary":{"name":"primar","description":"Majoritatea textului, iconițe și margini."},"secondary":{"name":"secundar","description":"Culoarea principală de fundal și culoarea textului anumitor butoane."},"tertiary":{"name":"terțiar","description":"Adrese, cateva butoane, notificări, și culoarea de accent."},"quaternary":{"name":"quaternar","description":"Adrese de navigare."},"header_background":{"name":"fundalul Header-ului","description":"Culoarea de fundal a header-ului din site."},"header_primary":{"name":"header-ul primar","description":"Textul și inconițele din header-ul site-ului."},"highlight":{"name":"Iluminare","description":"Culoarea de fundal a elementelor iluminate din pagina, cum ar fi postări și discuții."},"danger":{"name":"Pericol","description":"Ilumineazș culoarea pentru acțiuni ca ștergerea postărilor și a discuțiilor."},"success":{"name":"succes","description":"Indică starea de succes a unei operațiuni."},"love":{"name":"Iubire","description":"Culoarea butonului de apreciere."},"wiki":{"name":"wiki","description":"Culoarea de bază folosită pentru fundalul postărilor pe wiki."}}},"email":{"title":"Email","settings":"Opțiuni","all":"Toate","sending_test":"Trimite email de test...","error":"\u003cb\u003eEROARE\u003c/b\u003e - %{server_error}","test_error":"S-a semnalat o problemă la trimtirerea email-ului. Vă rugăm verificați setările mailului, Verificați ca gazda sa nu bocheze conexiunile de email și reâncercați.","sent":"Trimise","skipped":"Omise","sent_at":"Trimise la","time":"Timp","user":"Utilizator","email_type":"Tipul de Email","to_address":"La adresa","test_email_address":"Adresă email de test","send_test":"Trimite Email de test","sent_test":"trimis!","delivery_method":"Metoda de livrare","preview_digest":"Previzualizează rezumat","refresh":"Reîmprospătează","format":"Format","html":"html","text":"text","last_seen_user":"Ultimul utilizator văzut:","reply_key":"Cheie de răspuns","skipped_reason":"Motiv omiterii","logs":{"none":"Nu s-au găsit rapoarte.","filters":{"title":"Filtru","user_placeholder":"nume utilizator","address_placeholder":"nume@exemplu.com","type_placeholder":"rezumat, înregistrare...","reply_key_placeholder":"cheie de răspuns","skipped_reason_placeholder":"motivul"}}},"logs":{"title":"Rapoarte","action":"Acțiune","created_at":"Creat","last_match_at":"Ultima potrivire","match_count":"Potriviri","ip_address":"Adresa IP","topic_id":"ID Discuție","post_id":"ID Mesaj","delete":"Șterge","edit":"Editează","save":"Salvează","screened_actions":{"block":"blochează","do_nothing":"nu acționa"},"staff_actions":{"title":"Acțiunile membrilor din staff","instructions":"Clic pe numele utilizatorului şi acţiuni pentru a filtra lista. Clic pe poză profilului pentru a vizita pagina utilizatorului.","clear_filters":"Arată tot","staff_user":"Utilizatorul din staff","target_user":"Utilizator țintă","subject":"Subiect","when":"Când","context":"Contextul","details":"Detalii","previous_value":"Precedent","new_value":"Nou","diff":"Diff","show":"Arată","modal_title":"Detalii","no_previous":"Nu există valoare precedentă.","deleted":"Nu există valoare nouă. Jurnalele au fost șterse.","actions":{"delete_user":"șterge utilizator","change_trust_level":"schimbă nivelul de încredere","change_username":"schimbă numele utilizatorului","change_site_setting":"schimbă setările site-ului","change_site_customization":"schimbă preferințele site-ului","delete_site_customization":"șterge preferințele site-ului","suspend_user":"suspendă utilizator","unsuspend_user":"reactivează utilizator","grant_badge":"acordă insignă","revoke_badge":"revocă insignă","check_email":"Verifică emailul","delete_topic":"şterge discuția","delete_post":"şterge mesajul","impersonate":"joacă rolul","anonymize_user":"fă userul anonim"}},"screened_emails":{"title":"Email-uri filtrate","description":"Când cineva încearcă să creeze un nou cont, următorul email va fi verificat iar înregistrarea va fi blocată, sau o altă acțiune va fi inițiată.","email":"Adresa email","actions":{"allow":"Permite"}},"screened_urls":{"title":"URL-uri filtrate","description":"URL-urile listate aici au fost folosite în postări de către utilizatorii ce sunt identificați ca spammeri.","url":"URL","domain":"Domeniu"},"screened_ips":{"title":"IP-uri filtrate","description":"adresele de IP sunt supravegheate. Folosește \"permite\" să golești lista de IP-uri.","delete_confirm":"Ești sigur că vrei să anulezi regula pentru %{ip_address}?","actions":{"block":"Blochează","do_nothing":"Permite","allow_admin":"Permite Admin"},"form":{"label":"Noi:","ip_address":"Adresă IP","add":"Adaugă","filter":"Caută"},"roll_up":{"text":"Roll up"}},"logster":{"title":"Jurnal de erori"}},"impersonate":{"title":"Imită Utilizator","help":"Folosește această unealtă pentru a imita un cont de utilizator în scopul de debugging.","not_found":"Utilizatorul nu poate fi găsit.","invalid":"Ne pare rău, dar nu puteţi prelua rolul acelui utilizator."},"users":{"title":"Utilizatori","create":"Adaugă Utilizator cu titlul de Admin","last_emailed":"Ultimul Email trimis","not_found":"Ne pare rău, acest nume de utilizator nu există în sistem.","id_not_found":"Ne pare rău, dar acest utilizator nu există în sistemul nostru.","active":"Activ","show_emails":"Arată Mail-urile","nav":{"new":"Nou","active":"Activ","pending":"În așteptare","staff":"Personalul","suspended":"Suspendate","blocked":"Blocate","suspect":"Suspect"},"approved":"Aprobate?","approved_selected":{"one":"aprobă utilizatorul","few":"aprobă utilizatorii ({{count}})","other":"aprobă utilizatorii ({{count}})"},"reject_selected":{"one":"refuză utilizatorul","few":"refuză utilizatorii ({{count}})","other":"refuză utilizatorii ({{count}})"},"titles":{"active":"Utilizatori activi","new":"Utilizatori noi","pending":"Utilizatori în așteptare de previzualizare","newuser":"Utilizatori la nielul de încredere 0 (utilizator nou)","basic":"Utilizatori la nivel de încredere 1 (utilizator de baza)","staff":"Personalul","admins":"Utilizatori admin","moderators":"Moderatori","blocked":"Utilizatori blocați","suspended":"Utilizatori suspendați","suspect":"Utilizatori Suspecţi"},"reject_successful":{"one":"1 utilizator a fost rejectat cu success.","few":"%{count} utilizatori au fost rejectaţi cu success.","other":"%{count} utilizatori au fost rejectaţi cu success."},"reject_failures":{"one":"Rejectarea a 1 utilizator a eşuat.","few":"Rejectarea a %{count} utilizatori a eşuat.","other":"Rejectarea a %{count} utilizatori a eşuat."},"not_verified":"Neverificat","check_email":{"title":"Arată adresa de email a acestui utilizator","text":"Arată"}},"user":{"suspend_failed":"Ceva nu a funcționat în suspendarea acestui utilizator {{error}}","unsuspend_failed":"Ceva nu a funcționat în activarea acestui utilizator {{error}}","suspend_duration":"Pentru cât timp va fi suspendat utilizatorul?","suspend_duration_units":"(zile)","suspend_reason_label":"De ce suspendați? Acest text \u003cb\u003eva fi vizibil oricui\u003c/b\u003e pe pagina de profil a utilizatorului, și va fi arătat utilizatorului când încearca autentificara. încercați să fiți succint.","suspend_reason":"Motiv","suspended_by":"Suspendat de","delete_all_posts":"Șterge toate postările","delete_all_posts_confirm":"Sunteți pe cale să ștergeți %{posts} de postări și %{topics} de discuții. Sunteți sigur?","suspend":"Suspendat","unsuspend":"Activat","suspended":"Suspendat?","moderator":"Moderator?","admin":"Admin?","blocked":"Blocat?","show_admin_profile":"Admin","edit_title":"Editează Titlu","save_title":"Salvează Titlu","refresh_browsers":"Fortează reîmprospătarea browserului","refresh_browsers_message":"Mesajul a fost trimis către toţi clienţii. ","show_public_profile":"Arată profilul public","impersonate":"Imită","ip_lookup":"Cautare IP","log_out":"Ieșire","logged_out":"Acest utilizator a ieșit de pe toate dispozitivele","revoke_admin":"Revocă tirlu Admin","grant_admin":"Acordă titlu Admin","revoke_moderation":"Revocă titlu moderator","grant_moderation":"Acordă titlu moderator","unblock":"Deblochează","block":"Blochează","reputation":"Reputație","permissions":"Permisiuni","activity":"Activitate","like_count":"Aprecieri primite","last_100_days":"în ultimele 100 zile","private_topics_count":"Discuții private","posts_read_count":"Postări citite","post_count":"Postări Create","topics_entered":"Discuții Văzute","flags_given_count":"Marcaje acordate","flags_received_count":"Marcaje primite","warnings_received_count":"Avertizări Primite","flags_given_received_count":"Marcaje Acordate / Primite","approve":"Aprobare","approved_by":"aprobat de","approve_success":"Utilizator aprobat , email trimis cu instrucțiuni de activare.","approve_bulk_success":"Succes! Toți utilizatorii selectați au fost aprobați și notificați.","time_read":"Timp de citire","anonymize":"Fă userul anonim","anonymize_confirm":"Sunteţi SIGUR că vreţi să transformaţi acest cont într-un cont anonim? Operaţiunea va schimba numele utilizatorului şi adresa de email şi va reseta toate informaţiile din profil.","anonymize_yes":"Da, fă acest user anonim","anonymize_failed":"A apărut o problema în timpul transformării contului în cont anonim.","delete":"Ștergere Utilizator","delete_forbidden_because_staff":"Adminii și moderatorii nu pot fi sterși.","delete_posts_forbidden_because_staff":"Nu puteți șterge toate mesajele administratorilor și moderatorilor.","delete_forbidden":{"one":"Utilizatorii nu pot fi şterşi dacă au postări. Ştergeţi toate postările înainte de a încerca ştergerea unui utilizator. (Postările mai vechi de %{count} zile nu pot fi şterse)","few":"Utilizatorii nu pot fi şterşi dacă au postări. Ştergeţi toate postările înainte de a încerca ştergerea unui utilizator. (Postările mai vechi de %{count} zile nu pot fi şterse)","other":"Utilizatorii nu pot fi şterşi dacă au postări. Ştergeţi toate postările înainte de a încerca ştergerea unui utilizator. (Postările mai vechi de %{count} zile nu pot fi şterse)"},"cant_delete_all_posts":{"one":"Nu pot fi şterse toate postările. Unele postări sunt mai vechi de %{count} zile. (Setarea delete_user_max_post_age)","few":"Nu pot fi şterse toate postările. Unele postări sunt mai vechi de %{count} zile. (Setarea delete_user_max_post_age)","other":"Nu pot fi şterse toate postările. Unele postări sunt mai vechi de %{count} zile. (Setarea delete_user_max_post_age)"},"cant_delete_all_too_many_posts":{"one":"Nu pot fi şterse toate postările deoarece utilizatorul are mai mult de 1 postare. (Setarea delete_all_posts_max)","few":"Nu pot fi şterse toate postările deoarece utilizatorul are mai mult de %{count} postări. (Setarea delete_all_posts_max)","other":"Nu pot fi şterse toate postările deoarece utilizatorul are mai mult de %{count} postări. (Setarea delete_all_posts_max)"},"delete_confirm":"Sunteți sigur că doriți ștergerea acestui utilizator? Acțiunea este permanentă!","delete_and_block":"\u003cb\u003eDa\u003c/b\u003e, și \u003cb\u003eblock\u003c/b\u003e viitoarele autentificări pe acest email și adresă IP","delete_dont_block":"\u003cb\u003eDa\u003c/b\u003e, șterge decât utilizatorul","deleted":"Utilizatorul a fost șters.","delete_failed":"S-a semnalat o eroare la ștergerea utilizatorului. Asigurați-vă că toate postările sunt șterse înainte de a încerca ștergerea utilizatorului.","send_activation_email":"Trimite email de activare","activation_email_sent":"Um email de activare a fost trimis.","send_activation_email_failed":"S-a semnalat o eroare la trimiterea altui email de activare. %{error}","activate":"Activarea contului","activate_failed":"S-a semnalat o problemă la activarea utilizatorului.","deactivate_account":"Dezactivează cont","deactivate_failed":"S-a semnalat o problemă la dezactivarea utilizatoprului.","unblock_failed":"S-a semnalat o problemă la deblocarea utlizatorului.","block_failed":"S-a semnalat o problemă la blocarea utilizatorului.","deactivate_explanation":"Un utilizator dezactivat va trebuii sa-și reactvieze emailul.","suspended_explanation":"Un utilizator suspendat nu se poate autentifica","block_explanation":"Un utilizator blocat nu poate posta sau pornii o discuție.","trust_level_change_failed":"S-a semnalat o problemă la schimbarea nivelului de încredere al utilizatorului.","suspend_modal_title":"Suspendă utilizator","trust_level_2_users":"utilizatori de nivel de încredere 2 ","trust_level_3_requirements":"Cerințe pentru nivelul 3 de încredere","trust_level_locked_tip":"Nivelul de Încredere este blocat, sistemul nu va promova sau retrograda utilizatorii","trust_level_unlocked_tip":"Nivelul de Încredere este deblocat, sistemul poate promova sau retrograda utilizatorii","lock_trust_level":"Blochează Nivelul de Încredere","unlock_trust_level":"Deblochează Nivelul de Încredere","tl3_requirements":{"title":"Cerințe pentru nivelul 3 de încredere","table_title":"În ultimele 100 de zile:","value_heading":"Valoarea","requirement_heading":"Cerințe","visits":"Vizite","days":"zile","topics_replied_to":"Discuții la care s-a răspuns","topics_viewed":"Discuții văzute","topics_viewed_all_time":"Discuții văzute (din totdeauna)","posts_read":"Postări citite","posts_read_all_time":"Postări citite (din totdeauna)","flagged_posts":"Postări marcate","flagged_by_users":"Utilizatori ce au marcat","likes_given":"Aprecieri Oferite","likes_received":"Aprecieri Primite","likes_received_days":"Aprecieri Primite: zile unice","likes_received_users":"Aprecieri Primite: utilizatori unici","qualifies":"Calificări pentru nivelul 3 de încredere.","does_not_qualify":"Nu se califică pentru nivelul 3 de încredere.","will_be_promoted":"Vor fi promovați în 24 de ore.","will_be_demoted":"Va fi retrogradat în curând.","on_grace_period":"În prezent, în perioada de grație de promovare, nu va fi retrogradat.","locked_will_not_be_promoted":"Nivelul de Încredere blocat. Nu va fi niciodata promovat.","locked_will_not_be_demoted":"Nivelul de Încredere blocat. Nu va fi niciodata retrogradat."},"sso":{"title":"Single Sign On","external_id":"ID Extern","external_username":"Nume Utilizator","external_name":"Nume","external_email":"Email","external_avatar_url":"URL poză de profil"}},"user_fields":{"title":"Câmpuri utilizator","help":"Adăugaţi câmpuri pe care utilizatorii le pot completa.","create":"Crează un câmp utilizator","untitled":"Fără titlu","name":"Nume câmp","type":"Tip câmp","description":"Descriere câmp","save":"Salvează","edit":"Editează","delete":"Șterge","cancel":"Anulează","delete_confirm":"Sunteți sigur că stergeți acest câmp utilizator?","required":{"title":"Necesar la înscriere?","enabled":"necesar","disabled":"opţional"},"editable":{"title":"Editabil după înregistrare?","enabled":"editabil","disabled":"nu este editabil"},"show_on_profile":{"title":"Arată în profilul public","enabled":"arată în profil","disabled":"nu arată în profil"},"field_types":{"text":"Câmp Text","confirm":"Confirmare"}},"site_text":{"none":"Alege un tip de conținut pentru editare.","title":"Conținut"},"site_settings":{"show_overriden":"Arată doar rescrierile","title":"Setări","reset":"resetează","none":"nimic","no_results":"Nu s-au găsit rezultate.","clear_filter":"Golește","add_url":"adaugă URL","categories":{"all_results":"Toate","required":"Cerute","basic":"Setări de bază","users":"Utilizatori","posting":"Mesaje","email":"Email","files":"Fișiere","trust":"Niveluri de încredere","security":"Securitate","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Limita rată","developer":"Developer","embedding":"Includere","legal":"Legal","uncategorized":"Altele","backups":"Rezervări","login":"Autentificare","plugins":"Plugin-uri"}},"badges":{"title":"Insigne","new_badge":"Insignă nouă","new":"Nou","name":"Nume","badge":"Insignă","display_name":"Afițeaza numele","description":"Descrierea","badge_type":"Tipul insignei","badge_grouping":"Grup","badge_groupings":{"modal_title":"Insigne de grup"},"granted_by":"Acordat de","granted_at":"Acordat la","reason_help":"(O legătură către un mesaj sau o discuţie)","save":"Salvează","delete":"Șterge","delete_confirm":"Sunteți sigur că stergeți insigna?","revoke":"Revocă","reason":"Motiv","expand":"Extinde \u0026hellip;","revoke_confirm":"Sunteți sigur ca  revocați insigna?","edit_badges":"Editează insigne","grant_badge":"Acordă insignă","granted_badges":"Insigne acordate","grant":"Acordă","no_user_badges":"%{name} nu i-a fost acordată nicio insignă.","no_badges":"Nu există nicio insignă ce poate fi acordată.","none_selected":"Selectaţi o insignă pentru a începe","allow_title":"Permite insigna sa fie folosită ca titlu","multiple_grant":"Poate sa fie acordată de mai multe ori","listable":"Arată insignă pe pagina publică a insignelor","enabled":"Activează insignă","icon":"Iconită","image":"Imagine","icon_help":"Folosiţi o clasă Font Awesome sau un URL pentru imagine","query":"Verificare insignă (SQL)","target_posts":"Interogarea mesajelor ţintă","auto_revoke":"Pornește verificarea de revocare î fiecare zi","show_posts":"Arata mesaje ce acordă insigne pe pagina de insigne","trigger":"Declanșator","trigger_type":{"none":"reinprospatează zilnic","post_action":"Când un utilizator reacționează la un mesaj","post_revision":"Când un utlizator crează sau editează un mesaj","trust_level_change":"Când un utilizator schimbă nivelul de încredere","user_change":"Când un utilizator este editat sau creat"},"preview":{"link_text":"Vedeţi insignele acordate","plan_text":"Vedeţi cu plan de execuţie","modal_title":"Interogare Previzualizare Insignă","sql_error_header":"A apărut o eroare la executarea interogării.","error_help":"Vezi legăturile următoare pentru ajutor referitor la interogări pentru insigne.","bad_count_warning":{"header":"ATENȚIE!"},"sample":"Specimen:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e pentru mesajul în %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e pentru mesajul în %{link} la \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e la \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Adaugă un nou \"emoji\" care va fi disponibil pentru toţi. (PROTIP: trage şi adaugă mai multe fişiere odată)","add":"Adaugă un Nou Emoji","name":"Nume","image":"Imagine","delete_confirm":"Sunteţi sigur că doriţi să ștergeți :%{name}: emoji?"}},"lightbox":{"download":"descarcă"},"search_help":{"title":"Ajutor căutare"},"keyboard_shortcuts_help":{"title":"Scurtături de tastatură","jump_to":{"title":"Sari la","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Acasă","latest":"\u003cb\u003eg\u003c/b\u003e apoi \u003cb\u003el\u003c/b\u003e ultimele","new":"\u003cb\u003eg\u003c/b\u003e apoi \u003cb\u003en\u003c/b\u003e noi","unread":"\u003cb\u003eg\u003c/b\u003e apoi \u003cb\u003eu\u003c/b\u003e Necitite","categories":"\u003cb\u003eg\u003c/b\u003e apoi \u003cb\u003ec\u003c/b\u003e Categorii","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Top","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Semne de carte"},"navigation":{"title":"Navigare","jump":"\u003cb\u003e#\u003c/b\u003e Mergi la mesajul #","back":"\u003cb\u003eu\u003c/b\u003e Înapoi","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Muta selecția sus/jos","open":"\u003cb\u003eo\u003c/b\u003e sau \u003cb\u003eIntrodu\u003c/b\u003e Deschide discutia selectată","next_prev":"\u003cb\u003e`\u003c/b\u003e/\u003cb\u003e~\u003c/b\u003e selecția Urmatoare/Precedentă"},"application":{"title":"Applicația","create":"\u003cb\u003ec\u003c/b\u003e Crează discuție nouă","notifications":"\u003cb\u003en\u003c/b\u003e Deschide notificare","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Deschide meniu utilizator","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Arată discuţiile actualizate","search":"\u003cb\u003e/\u003c/b\u003e Caută","help":"\u003cb\u003e?\u003c/b\u003e Deschide ajutorul de scurtături de tastatură","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Respinge Nou/Mesaj","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Respinge Discuţia"},"actions":{"title":"Acțiuni","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Comută semnul de carte pentru discuţie","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Pin/Unpin topic","share_topic":"\u003cb\u003eshift s\u003c/b\u003e distribuie discuție","share_post":"\u003cb\u003es\u003c/b\u003e Distribuie mesajul","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Răspunde că discuţie legată","reply_topic":"\u003cb\u003eshift r\u003c/b\u003e Raspunde la discuție","reply_post":"\u003cb\u003er\u003c/b\u003e Răspunde la postare","quote_post":"\u003cb\u003eq\u003c/b\u003e Citează mesajul","like":"\u003cb\u003el\u003c/b\u003e Apreciează mesajul","flag":"\u003cb\u003e!\u003c/b\u003e Marchează mesajul","bookmark":"\u003cb\u003eb\u003c/b\u003e Marchează cu semn de carte postarea","edit":"\u003cb\u003ee\u003c/b\u003e Editează mesaj","delete":"\u003cb\u003ed\u003c/b\u003e Șterge mesaj","mark_muted":"\u003cb\u003em\u003c/b\u003e apoi \u003cb\u003em\u003c/b\u003e Marchează discuția ca silențios","mark_regular":"\u003cb\u003em\u003c/b\u003e apoi \u003cb\u003er\u003c/b\u003e Marchează discuția ca normală","mark_tracking":"\u003cb\u003em\u003c/b\u003e apoi \u003cb\u003et\u003c/b\u003e Marchează discuția ca urmărită","mark_watching":"\u003cb\u003em\u003c/b\u003e apoi \u003cb\u003ew\u003c/b\u003e Marchează discuția ca privită"}},"badges":{"title":"Insigne","allow_title":"poate fi folosit ca titlu","multiple_grant":"pot fi acordate de mai multe ori","badge_count":{"one":"1 Insignă","few":"%{count} Insigne","other":"%{count} Insigne"},"more_badges":{"one":"+1 Mai mult","few":"+%{count} Mai mult","other":"+%{count} Mai mult"},"granted":{"one":"1 acordat","few":"2 acordate","other":"%{count} acordate"},"select_badge_for_title":"Selectează o insignă pentru a o folosii ca titlu","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"Să începem"},"community":{"name":"Communitate"},"trust_level":{"name":"Nivel de încredere"},"other":{"name":"Altele"},"posting":{"name":"Scrie mesaj"}},"badge":{"editor":{"name":"Editor","description":"Primul mesaj editat"},"basic_user":{"name":"De baza","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eAcordată\u003c/a\u003e toate funcțiile esențiale"},"member":{"name":"Membru","description":"Invitaţii \u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eAcordate\u003c/a\u003e"},"regular":{"name":"Normal"},"leader":{"name":"Lider","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eAcrodată\u003c/a\u003e recategorisește , redenumește, adrese urmărite și lounge"},"welcome":{"name":"Bine ai venit","description":"A primit o apreceiere"},"autobiographer":{"name":"Autobiograf","description":"Informația de \u003ca href=\"/my/preferences\"\u003eprofil\u003c/a\u003e completă a utilizatorului"},"anniversary":{"name":"Aniversare","description":"Membru activ pentru un an, a scris măcar un mesaj"},"nice_post":{"name":"Mesaj drăguţ","description":"A primit 10 aprecieri pentru o postare. Această insignă poate fi acordată de multiple ori"},"good_post":{"name":"Mesaj bun","description":"A primit 25 de aprecieri pentru un mesaj. Această insignă poate fi acordată de mai multe ori"},"great_post":{"name":"Mesaj foarte bun","description":"A primit 50 de aprecieri pentru un mesaj. Această insignă poate fi acordată de mai multe ori"},"nice_topic":{"name":"Discuţie Drăguţă","description":"A primit 10 de aprecieri pentru o discuţie. Această insignă poate fi acordată de mai multe ori"},"good_topic":{"name":"Discuţie Bună","description":"A primit 25 de aprecieri pentru o discuţie. Această insignă poate fi acordată de mai multe ori"},"great_topic":{"name":"Discuţie Foarte Bună","description":"A primit 50 de aprecieri pentru o discuţie. Această insignă poate fi acordată de mai multe ori"},"nice_share":{"name":"Drăguţ","description":"A împărţit un mesaj cu 25 utilizatori unici"},"good_share":{"name":"Bun","description":"A împărţit un mesaj cu 300 utilizatori unici"},"great_share":{"name":"Perfect","description":"A împărţit un mesaj cu 1000 utilizatori unici"},"first_like":{"name":"Prima apreciere","description":"A apreciat un mesaj"},"first_flag":{"name":"Primul marcaj","description":"A marcat un mesaj"},"promoter":{"name":"Promotor","description":"A invitat un utilizator"},"campaigner":{"name":"Combatant"},"champion":{"name":"Campion"},"first_share":{"name":"Primul","description":"A distribuit un mesaj"},"first_link":{"name":"Prima adresă","description":"A adăugat o adresă internă catre altă discuție"},"first_quote":{"name":"Primul citat","description":"A citat un alt utilizator"},"read_guidelines":{"name":"Citește reguli de ajutor","description":"Citește \u003ca href=\"/regulile de ajutor\"\u003e comune\u003c/a\u003e"},"reader":{"name":"Cititorul","description":"Citeşte fiecare mesaj dintr-o discuție cu mai mult de 100 de mesaje"}}}}},"en":{"js":{"number":{"format":{"separator":".","delimiter":","},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"full_no_year_no_time":"MMMM Do","full_with_year_no_time":"MMMM Do, YYYY","later":{"x_days":{"one":"1 day later","other":"%{count} days later"},"x_months":{"one":"1 month later","other":"%{count} months later"},"x_years":{"one":"1 year later","other":"%{count} years later"}}},"action_codes":{"closed":{"disabled":"opened %{when}"},"pinned":{"disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","banner":{"edit":"Edit this banner \u003e\u003e"},"queue":{"has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval","other":"This topic has \u003cb\u003e{{count}}\u003c/b\u003e posts awaiting approval"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"user":{"watched_categories_instructions":"You will automatically watch all new topics in these categories. You will be notified of all new posts and topics, and a count of new posts will also appear next to the topic.","tracked_categories_instructions":"You will automatically track all new topics in these categories. A count of new posts will appear next to the topic.","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"invited":{"truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab":"Redeemed","redeemed_tab_with_count":"Redeemed ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"}},"errors":{"reasons":{"not_found":"Page Not Found"}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","signup_cta":{"intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account."},"composer":{"whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip":"select images from your device","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor","select_file":"Select File"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"no_more_results":"No more results found.","search_help":"Search help"},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again"},"none":{"educate":{"unread":"\u003cp\u003eYour unread topics appear here.\u003c/p\u003e\u003cp\u003eBy default, topics are considered unread and will show unread counts \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e if you:\u003c/p\u003e\u003cul\u003e\u003cli\u003eCreated the topic\u003c/li\u003e\u003cli\u003eReplied to the topic\u003c/li\u003e\u003cli\u003eRead the topic for more than 4 minutes\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eOr if you have explicitly set the topic to Tracked or Watched via the notification control at the bottom of each topic.\u003c/p\u003e\u003cp\u003eYou can change this in your \u003ca href=\"%{userPrefsUrl}\"\u003epreferences\u003c/a\u003e.\u003c/p\u003e"}}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"reasons":{"1_2":"You will be notified if someone mentions your @name or replies to you.","1":"You will be notified if someone mentions your @name or replies to you."},"watching_pm":{"description":"You will be notified of every new reply in this message, and a count of new replies will be shown."},"watching":{"description":"You will be notified of every new reply in this topic, and a count of new replies will be shown."},"tracking_pm":{"description":"A count of new replies will be shown for this message. You will be notified if someone mentions your @name or replies to you."},"tracking":{"description":"A count of new replies will be shown for this topic. You will be notified if someone mentions your @name or replies to you. "},"regular":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"regular_pm":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","invite_reply":{"to_topic_username":"You've entered a username. We'll send a notification with a link inviting them to this topic.","to_username":"Enter the username of the person you'd like to invite. We'll send a notification with a link inviting them to this topic."},"change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","has_replies":{"one":"{{count}} Reply","other":"{{count}} Replies"},"has_likes":{"one":"{{count}} Like","other":"{{count}} Likes"},"has_likes_title":{"one":"1 person liked this post","other":"{{count}} people liked this post"},"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"whisper":"this post is a private whisper for moderators","controls":{"change_owner":"Change Ownership"}},"category":{"all":"All categories","topic_template":"Topic Template","create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal","description":"You will be notified if someone mentions your @name or replies to you."},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_staff":"Notify Staff"},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}},"top":{"quarterly":{"title":"Quarterly"},"this_year":"Year","this_quarter":"Quarter","this_month":"Month","this_week":"Week","other_periods":"see top"}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"voters":{"one":"voter","other":"voters"},"total_votes":{"one":"total vote","other":"total votes"},"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"dashboard":{"mobile_title":"Mobile"},"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"plugins":{"enabled":"Enabled?","is_enabled":"Y","not_enabled":"N","change_settings_short":"Settings"},"export_json":{"button_text":"Export"},"customize":{"embedded_css":"Embedded CSS","import":"Import","import_title":"Select a file or paste text","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"roll_up":"roll up IP blocks","change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}},"screened_ips":{"roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?","rolled_up_some_subnets":"Successfully rolled up IP ban entries to these subnets: %{subnets}.","rolled_up_no_subnet":"There was nothing to roll up.","roll_up":{"title":"Creates new subnet ban entries if there are at least 'min_ban_entries_for_roll_up' entries."}}},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"}},"user_fields":{"options":"Options","field_types":{"dropdown":"Dropdown"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"add_host":"add host","categories":{"user_preferences":"User Preferences"}},"badges":{"preview":{"bad_count_warning":{"text":"There are missing grant samples. This happens when the badge query returns user IDs or post IDs that do not exist. This may cause unexpected results later on - please double-check your query."},"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"},"permalink":{"title":"Permalinks","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Post ID","post_title":"Post","category_id":"Category ID","category_title":"Category","external_url":"External URL","delete_confirm":"Are you sure you want to delete this permalink?","form":{"label":"New:","add":"Add","filter":"Search (URL or External URL)"}}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}},"badges":{"badge":{"regular":{"description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eGranted\u003c/a\u003e recategorize, rename, followed links and lounge"},"campaigner":{"description":"Invited 3 basic users (trust level 1)"},"champion":{"description":"Invited 5 members (trust level 2)"},"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'ro';
//! moment.js
//! version : 2.8.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {
    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = '2.8.1',
        // the global-scope this is NOT the global object in Node.js
        globalScope = typeof global !== 'undefined' ? global : this,
        oldGlobalMoment,
        round = Math.round,
        i,

        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,

        // internal storage for locale config files
        locales = {},

        // extra moment internal properties (plugins register props here)
        momentProperties = [],

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,

        // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
        // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenOneToFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenDigits = /\d+/, // nonzero number of digits
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO separator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123
        parseTokenOrdinal = /\d{1,2}/,

        //strict parsing regexes
        parseTokenOneDigit = /\d/, // 0 - 9
        parseTokenTwoDigits = /\d\d/, // 00 - 99
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{4}/, // 0000 - 9999
        parseTokenSixDigits = /[+-]?\d{6}/, // -999,999 - 999,999
        parseTokenSignedNumber = /[+-]?\d+/, // -inf - inf

        // iso 8601 regex
        // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,

        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        isoDates = [
            ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
            ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
            ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
            ['GGGG-[W]WW', /\d{4}-W\d{2}/],
            ['YYYY-DDD', /\d{4}-\d{3}/]
        ],

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            D : 'date',
            w : 'week',
            W : 'isoWeek',
            M : 'month',
            Q : 'quarter',
            y : 'year',
            DDD : 'dayOfYear',
            e : 'weekday',
            E : 'isoWeekday',
            gg: 'weekYear',
            GG: 'isoWeekYear'
        },

        camelFunctions = {
            dayofyear : 'dayOfYear',
            isoweekday : 'isoWeekday',
            isoweek : 'isoWeek',
            weekyear : 'weekYear',
            isoweekyear : 'isoWeekYear'
        },

        // format function strings
        formatFunctions = {},

        // default relative time thresholds
        relativeTimeThresholds = {
            s: 45,  // seconds to minute
            m: 45,  // minutes to hour
            h: 22,  // hours to day
            d: 26,  // days to month
            M: 11   // months to year
        },

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.localeData().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.localeData().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.localeData().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.localeData().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.localeData().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            YYYYYY : function () {
                var y = this.year(), sign = y >= 0 ? '+' : '-';
                return sign + leftZeroFill(Math.abs(y), 6);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return leftZeroFill(this.weekYear(), 4);
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 4);
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return toInt(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(toInt(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            SSSS : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + ':' + leftZeroFill(toInt(a) % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            X    : function () {
                return this.unix();
            },
            Q : function () {
                return this.quarter();
            }
        },

        deprecations = {},

        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'];

    // Pick the first defined of two or three arguments. dfl comes from
    // default.
    function dfl(a, b, c) {
        switch (arguments.length) {
            case 2: return a != null ? a : b;
            case 3: return a != null ? a : b != null ? b : c;
            default: throw new Error('Implement me');
        }
    }

    function defaultParsingFlags() {
        // We need to deep clone this object, and es5 standard is not very
        // helpful.
        return {
            empty : false,
            unusedTokens : [],
            unusedInput : [],
            overflow : -2,
            charsLeftOver : 0,
            nullInput : false,
            invalidMonth : null,
            invalidFormat : false,
            userInvalidated : false,
            iso: false
        };
    }

    function printMsg(msg) {
        if (moment.suppressDeprecationWarnings === false &&
                typeof console !== 'undefined' && console.warn) {
            console.warn("Deprecation warning: " + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;
        return extend(function () {
            if (firstTime) {
                printMsg(msg);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            printMsg(msg);
            deprecations[name] = true;
        }
    }

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.localeData().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Locale() {
    }

    // Moment prototype object
    function Moment(config, skipOverflow) {
        if (skipOverflow !== false) {
            checkOverflow(config);
        }
        copyConfig(this, config);
        this._d = new Date(+config._d);
    }

    // Duration Constructor
    function Duration(duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = moment.localeData();

        this._bubble();
    }

    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }

        if (b.hasOwnProperty('toString')) {
            a.toString = b.toString;
        }

        if (b.hasOwnProperty('valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function copyConfig(to, from) {
        var i, prop, val;

        if (typeof from._isAMomentObject !== 'undefined') {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (typeof from._i !== 'undefined') {
            to._i = from._i;
        }
        if (typeof from._f !== 'undefined') {
            to._f = from._f;
        }
        if (typeof from._l !== 'undefined') {
            to._l = from._l;
        }
        if (typeof from._strict !== 'undefined') {
            to._strict = from._strict;
        }
        if (typeof from._tzm !== 'undefined') {
            to._tzm = from._tzm;
        }
        if (typeof from._isUTC !== 'undefined') {
            to._isUTC = from._isUTC;
        }
        if (typeof from._offset !== 'undefined') {
            to._offset = from._offset;
        }
        if (typeof from._pf !== 'undefined') {
            to._pf = from._pf;
        }
        if (typeof from._locale !== 'undefined') {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (typeof val !== 'undefined') {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength, forceSign) {
        var output = '' + Math.abs(number),
            sign = number >= 0;

        while (output.length < targetLength) {
            output = '0' + output;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        other = makeAs(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, "moment()." + name  + "(period, number) is deprecated. Please use moment()." + name + "(number, period).");
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = moment.duration(val, period);
            addOrSubtractDurationFromMoment(this, dur, direction);
            return this;
        };
    }

    function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
        }
        if (months) {
            rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            moment.updateOffset(mom, days || months);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return Object.prototype.toString.call(input) === '[object Date]' ||
            input instanceof Date;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        if (units) {
            var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
            units = unitAliases[units] || camelFunctions[lowered] || lowered;
        }
        return units;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (inputObject.hasOwnProperty(prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function makeList(field) {
        var count, setter;

        if (field.indexOf('week') === 0) {
            count = 7;
            setter = 'day';
        }
        else if (field.indexOf('month') === 0) {
            count = 12;
            setter = 'month';
        }
        else {
            return;
        }

        moment[field] = function (format, index) {
            var i, getter,
                method = moment._locale[field],
                results = [];

            if (typeof format === 'number') {
                index = format;
                format = undefined;
            }

            getter = function (i) {
                var m = moment().utc().set(setter, i);
                return method.call(moment._locale, m, format || '');
            };

            if (index != null) {
                return getter(index);
            }
            else {
                for (i = 0; i < count; i++) {
                    results.push(getter(i));
                }
                return results;
            }
        };
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            if (coercedNumber >= 0) {
                value = Math.floor(coercedNumber);
            } else {
                value = Math.ceil(coercedNumber);
            }
        }

        return value;
    }

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    function weeksInYear(year, dow, doy) {
        return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
    }

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function checkOverflow(m) {
        var overflow;
        if (m._a && m._pf.overflow === -2) {
            overflow =
                m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH :
                m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE :
                m._a[HOUR] < 0 || m._a[HOUR] > 23 ? HOUR :
                m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE :
                m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND :
                m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }

            m._pf.overflow = overflow;
        }
    }

    function isValid(m) {
        if (m._isValid == null) {
            m._isValid = !isNaN(m._d.getTime()) &&
                m._pf.overflow < 0 &&
                !m._pf.empty &&
                !m._pf.invalidMonth &&
                !m._pf.nullInput &&
                !m._pf.invalidFormat &&
                !m._pf.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    m._pf.charsLeftOver === 0 &&
                    m._pf.unusedTokens.length === 0;
            }
        }
        return m._isValid;
    }

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        if (!locales[name] && hasModule) {
            try {
                oldLocale = moment.locale();
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we want to undo that for lazy loaded locales
                moment.locale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function makeAs(input, model) {
        return model._isUTC ? moment(input).zone(model._offset || 0) :
            moment(input).local();
    }

    /************************************
        Locale
    ************************************/


    extend(Locale.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_'),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_'),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment.utc([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_'),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_'),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : 'h:mm A',
            L : 'MM/DD/YYYY',
            LL : 'MMMM D, YYYY',
            LLL : 'MMMM D, YYYY LT',
            LLLL : 'dddd, MMMM D, YYYY LT'
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : 'in %s',
            past : '%s ago',
            s : 'a few seconds',
            m : 'a minute',
            mm : '%d minutes',
            h : 'an hour',
            hh : '%d hours',
            d : 'a day',
            dd : '%d days',
            M : 'a month',
            MM : '%d months',
            y : 'a year',
            yy : '%d years'
        },

        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },

        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace('%d', number);
        },
        _ordinal : '%d',

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },

        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        },

        _invalidDate: 'Invalid date',
        invalidDate: function () {
            return this._invalidDate;
        }
    });

    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        var a, strict = config._strict;
        switch (token) {
        case 'Q':
            return parseTokenOneDigit;
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
            return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
            return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
            return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
            if (strict) {
                return parseTokenOneDigit;
            }
            /* falls through */
        case 'SS':
            if (strict) {
                return parseTokenTwoDigits;
            }
            /* falls through */
        case 'SSS':
            if (strict) {
                return parseTokenThreeDigits;
            }
            /* falls through */
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return config._locale._meridiemParse;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'SSSS':
            return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
            return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
            return parseTokenOneOrTwoDigits;
        case 'Do':
            return parseTokenOrdinal;
        default :
            a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), 'i'));
            return a;
        }
    }

    function timezoneMinutesFromString(string) {
        string = string || '';
        var possibleTzMatches = (string.match(parseTokenTimezone) || []),
            tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
            parts = (tzChunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? -minutes : minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // QUARTER
        case 'Q':
            if (input != null) {
                datePartArray[MONTH] = (toInt(input) - 1) * 3;
            }
            break;
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[MONTH] = toInt(input) - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = config._locale.monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[MONTH] = a;
            } else {
                config._pf.invalidMonth = input;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[DATE] = toInt(input);
            }
            break;
        case 'Do' :
            if (input != null) {
                datePartArray[DATE] = toInt(parseInt(input, 10));
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                config._dayOfYear = toInt(input);
            }

            break;
        // YEAR
        case 'YY' :
            datePartArray[YEAR] = moment.parseTwoDigitYear(input);
            break;
        case 'YYYY' :
        case 'YYYYY' :
        case 'YYYYYY' :
            datePartArray[YEAR] = toInt(input);
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = config._locale.isPM(input);
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[HOUR] = toInt(input);
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[MINUTE] = toInt(input);
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[SECOND] = toInt(input);
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
        case 'SSSS' :
            datePartArray[MILLISECOND] = toInt(('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = timezoneMinutesFromString(input);
            break;
        // WEEKDAY - human
        case 'dd':
        case 'ddd':
        case 'dddd':
            a = config._locale.weekdaysParse(input);
            // if we didn't get a weekday name, mark the date as invalid
            if (a != null) {
                config._w = config._w || {};
                config._w['d'] = a;
            } else {
                config._pf.invalidWeekday = input;
            }
            break;
        // WEEK, WEEK DAY - numeric
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'e':
        case 'E':
            token = token.substr(0, 1);
            /* falls through */
        case 'gggg':
        case 'GGGG':
        case 'GGGGG':
            token = token.substr(0, 2);
            if (input) {
                config._w = config._w || {};
                config._w[token] = toInt(input);
            }
            break;
        case 'gg':
        case 'GG':
            config._w = config._w || {};
            config._w[token] = moment.parseTwoDigitYear(input);
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = dfl(w.GG, config._a[YEAR], weekOfYear(moment(), 1, 4).year);
            week = dfl(w.W, 1);
            weekday = dfl(w.E, 1);
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = dfl(w.gg, config._a[YEAR], weekOfYear(moment(), dow, doy).year);
            week = dfl(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < dow) {
                    ++week;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        temp = dayOfYearFromWeeks(weekYear, week, weekday, doy, dow);

        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromConfig(config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = dfl(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                config._pf._overflowDayOfYear = true;
            }

            date = makeUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
        // Apply timezone offset from input. The actual zone can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() + config._tzm);
        }
    }

    function dateFromObject(config) {
        var normalizedInput;

        if (config._d) {
            return;
        }

        normalizedInput = normalizeObjectUnits(config._i);
        config._a = [
            normalizedInput.year,
            normalizedInput.month,
            normalizedInput.day,
            normalizedInput.hour,
            normalizedInput.minute,
            normalizedInput.second,
            normalizedInput.millisecond
        ];

        dateFromConfig(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        if (config._f === moment.ISO_8601) {
            parseISO(config);
            return;
        }

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    config._pf.unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    config._pf.empty = false;
                }
                else {
                    config._pf.unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                config._pf.unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            config._pf.unusedInput.push(string);
        }

        // handle am pm
        if (config._isPm && config._a[HOUR] < 12) {
            config._a[HOUR] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[HOUR] === 12) {
            config._a[HOUR] = 0;
        }

        dateFromConfig(config);
        checkOverflow(config);
    }

    function unescapeFormat(s) {
        return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        });
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function regexpEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            config._pf.invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            tempConfig._pf = defaultParsingFlags();
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);

            if (!isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += tempConfig._pf.charsLeftOver;

            //or tokens
            currentScore += tempConfig._pf.unusedTokens.length * 10;

            tempConfig._pf.score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    // date from iso format
    function parseISO(config) {
        var i, l,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            config._pf.iso = true;
            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(string)) {
                    // match[5] should be "T" or undefined
                    config._f = isoDates[i][0] + (match[6] || ' ');
                    break;
                }
            }
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (string.match(parseTokenTimezone)) {
                config._f += 'Z';
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function makeDateFromString(config) {
        parseISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            moment.createFromInputFallback(config);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i, matched;
        if (input === undefined) {
            config._d = new Date();
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if ((matched = aspNetJsonRegex.exec(input)) !== null) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromConfig(config);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            moment.createFromInputFallback(config);
        }
    }

    function makeDate(y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
            date.setFullYear(y);
        }
        return date;
    }

    function makeUTCDate(y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    function parseWeekday(input, locale) {
        if (typeof input === 'string') {
            if (!isNaN(input)) {
                input = parseInt(input, 10);
            }
            else {
                input = locale.weekdaysParse(input);
                if (typeof input !== 'number') {
                    return null;
                }
            }
        }
        return input;
    }

    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(posNegDuration, withoutSuffix, locale) {
        var duration = moment.duration(posNegDuration).abs(),
            seconds = round(duration.as('s')),
            minutes = round(duration.as('m')),
            hours = round(duration.as('h')),
            days = round(duration.as('d')),
            months = round(duration.as('M')),
            years = round(duration.as('y')),

            args = seconds < relativeTimeThresholds.s && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < relativeTimeThresholds.m && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < relativeTimeThresholds.h && ['hh', hours] ||
                days === 1 && ['d'] ||
                days < relativeTimeThresholds.d && ['dd', days] ||
                months === 1 && ['M'] ||
                months < relativeTimeThresholds.M && ['MM', months] ||
                years === 1 && ['y'] || ['yy', years];

        args[2] = withoutSuffix;
        args[3] = +posNegDuration > 0;
        args[4] = locale;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add(daysToDayOfWeek, 'd');
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = makeUTCDate(year, 0, 1).getUTCDay(), daysToAdd, dayOfYear;

        d = d === 0 ? 7 : d;
        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
            year: dayOfYear > 0 ? year : year - 1,
            dayOfYear: dayOfYear > 0 ?  dayOfYear : daysInYear(year - 1) + dayOfYear
        };
    }

    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        config._locale = config._locale || moment.localeData(config._l);

        if (input === null || (format === undefined && input === '')) {
            return moment.invalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (moment.isMoment(input)) {
            return new Moment(input, true);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === "boolean") {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._i = input;
        c._f = format;
        c._l = locale;
        c._strict = strict;
        c._isUTC = false;
        c._pf = defaultParsingFlags();

        return makeMoment(c);
    };

    moment.suppressDeprecationWarnings = false;

    moment.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i);
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return moment();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    moment.min = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    };

    moment.max = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    };

    // creating with utc
    moment.utc = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === "boolean") {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._useUTC = true;
        c._isUTC = true;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return makeMoment(c).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            parseIso,
            diffRes;

        if (moment.isDuration(input)) {
            duration = {
                ms: input._milliseconds,
                d: input._days,
                M: input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y: 0,
                d: toInt(match[DATE]) * sign,
                h: toInt(match[HOUR]) * sign,
                m: toInt(match[MINUTE]) * sign,
                s: toInt(match[SECOND]) * sign,
                ms: toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoDurationRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            parseIso = function (inp) {
                // We'd normally use ~~inp for this, but unfortunately it also
                // converts floats to ints.
                // inp may be undefined, so careful calling replace on it.
                var res = inp && parseFloat(inp.replace(',', '.'));
                // apply sign while we're at it
                return (isNaN(res) ? 0 : res) * sign;
            };
            duration = {
                y: parseIso(match[2]),
                M: parseIso(match[3]),
                d: parseIso(match[4]),
                h: parseIso(match[5]),
                m: parseIso(match[6]),
                s: parseIso(match[7]),
                w: parseIso(match[8])
            };
        } else if (typeof duration === 'object' &&
                ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(moment(duration.from), moment(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (moment.isDuration(input) && input.hasOwnProperty('_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // constant that refers to the ISO standard
    moment.ISO_8601 = function () {};

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    moment.momentProperties = momentProperties;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function allows you to set a threshold for relative time strings
    moment.relativeTimeThreshold = function (threshold, limit) {
        if (relativeTimeThresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return relativeTimeThresholds[threshold];
        }
        relativeTimeThresholds[threshold] = limit;
        return true;
    };

    moment.lang = deprecate(
        "moment.lang is deprecated. Use moment.locale instead.",
        function (key, value) {
            return moment.locale(key, value);
        }
    );

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    moment.locale = function (key, values) {
        var data;
        if (key) {
            if (typeof(values) !== "undefined") {
                data = moment.defineLocale(key, values);
            }
            else {
                data = moment.localeData(key);
            }

            if (data) {
                moment.duration._locale = moment._locale = data;
            }
        }

        return moment._locale._abbr;
    };

    moment.defineLocale = function (name, values) {
        if (values !== null) {
            values.abbr = name;
            if (!locales[name]) {
                locales[name] = new Locale();
            }
            locales[name].set(values);

            // backwards compat for now: also set the locale
            moment.locale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    };

    moment.langData = deprecate(
        "moment.langData is deprecated. Use moment.localeData instead.",
        function (key) {
            return moment.localeData(key);
        }
    );

    // returns locale data
    moment.localeData = function (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return moment._locale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment ||
            (obj != null &&  obj.hasOwnProperty('_isAMomentObject'));
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };

    for (i = lists.length - 1; i >= 0; --i) {
        makeList(lists[i]);
    }

    moment.normalizeUnits = function (units) {
        return normalizeUnits(units);
    };

    moment.invalid = function (flags) {
        var m = moment.utc(NaN);
        if (flags != null) {
            extend(m._pf, flags);
        }
        else {
            m._pf.userInvalidated = true;
        }

        return m;
    };

    moment.parseZone = function () {
        return moment.apply(null, arguments).parseZone();
    };

    moment.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.clone().locale('en').format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            var m = moment(this).utc();
            if (0 < m.year() && m.year() <= 9999) {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            } else {
                return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            return isValid(this);
        },

        isDSTShifted : function () {
            if (this._a) {
                return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
            }

            return false;
        },

        parsingFlags : function () {
            return extend({}, this._pf);
        },

        invalidAt: function () {
            return this._pf.overflow;
        },

        utc : function (keepLocalTime) {
            return this.zone(0, keepLocalTime);
        },

        local : function (keepLocalTime) {
            if (this._isUTC) {
                this.zone(0, keepLocalTime);
                this._isUTC = false;

                if (keepLocalTime) {
                    this.add(this._d.getTimezoneOffset(), 'm');
                }
            }
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.localeData().postformat(output);
        },

        add : createAdder(1, 'add'),

        subtract : createAdder(-1, 'subtract'),

        diff : function (input, units, asFloat) {
            var that = makeAs(input, this),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                // average number of days in the months in the given dates
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                // difference in months
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                // adjust by taking difference in days, average number of days
                // and dst in the given months.
                output += ((this - moment(this).startOf('month')) -
                        (that - moment(that).startOf('month'))) / diff;
                // same as above but with zones, to negate all dst
                output -= ((this.zone() - moment(this).startOf('month').zone()) -
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that);
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function (time) {
            // We want to compare the start of today, vs this.
            // Getting start-of-today depends on whether we're zone'd or not.
            var now = time || moment(),
                sod = makeAs(now, this).startOf('day'),
                diff = this.diff(sod, 'days', true),
                format = diff < -6 ? 'sameElse' :
                    diff < -1 ? 'lastWeek' :
                    diff < 0 ? 'lastDay' :
                    diff < 1 ? 'sameDay' :
                    diff < 2 ? 'nextDay' :
                    diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.localeData().calendar(format, this));
        },

        isLeapYear : function () {
            return isLeapYear(this.year());
        },

        isDST : function () {
            return (this.zone() < this.clone().month(0).zone() ||
                this.zone() < this.clone().month(5).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                input = parseWeekday(input, this.localeData());
                return this.add(input - day, 'd');
            } else {
                return day;
            }
        },

        month : makeAccessor('Month', true),

        startOf : function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'quarter':
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoWeek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoWeek') {
                this.isoWeekday(1);
            }

            // quarters are also special
            if (units === 'quarter') {
                this.month(Math.floor(this.month() / 3) * 3);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = units || 'ms';
            return +this.clone().startOf(units) === +makeAs(input, this).startOf(units);
        },

        min: deprecate(
                 'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
                 function (other) {
                     other = moment.apply(null, arguments);
                     return other < this ? this : other;
                 }
         ),

        max: deprecate(
                'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
                function (other) {
                    other = moment.apply(null, arguments);
                    return other > this ? this : other;
                }
        ),

        // keepLocalTime = true means only change the timezone, without
        // affecting the local hour. So 5:31:26 +0300 --[zone(2, true)]-->
        // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist int zone
        // +0200, so we adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        zone : function (input, keepLocalTime) {
            var offset = this._offset || 0,
                localAdjust;
            if (input != null) {
                if (typeof input === 'string') {
                    input = timezoneMinutesFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                if (!this._isUTC && keepLocalTime) {
                    localAdjust = this._d.getTimezoneOffset();
                }
                this._offset = input;
                this._isUTC = true;
                if (localAdjust != null) {
                    this.subtract(localAdjust, 'm');
                }
                if (offset !== input) {
                    if (!keepLocalTime || this._changeInProgress) {
                        addOrSubtractDurationFromMoment(this,
                                moment.duration(offset - input, 'm'), 1, false);
                    } else if (!this._changeInProgress) {
                        this._changeInProgress = true;
                        moment.updateOffset(this, true);
                        this._changeInProgress = null;
                    }
                }
            } else {
                return this._isUTC ? offset : this._d.getTimezoneOffset();
            }
            return this;
        },

        zoneAbbr : function () {
            return this._isUTC ? 'UTC' : '';
        },

        zoneName : function () {
            return this._isUTC ? 'Coordinated Universal Time' : '';
        },

        parseZone : function () {
            if (this._tzm) {
                this.zone(this._tzm);
            } else if (typeof this._i === 'string') {
                this.zone(this._i);
            }
            return this;
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).zone();
            }

            return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return daysInMonth(this.year(), this.month());
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
        },

        quarter : function (input) {
            return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.localeData()._week.dow, this.localeData()._week.doy).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        week : function (input) {
            var week = this.localeData().week(this);
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        weekday : function (input) {
            var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
            return input == null ? weekday : this.add(input - weekday, 'd');
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        isoWeeksInYear : function () {
            return weeksInYear(this.year(), 1, 4);
        },

        weeksInYear : function () {
            var weekInfo = this.localeData()._week;
            return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units]();
        },

        set : function (units, value) {
            units = normalizeUnits(units);
            if (typeof this[units] === 'function') {
                this[units](value);
            }
            return this;
        },

        // If passed a locale key, it will set the locale for this
        // instance.  Otherwise, it will return the locale configuration
        // variables for this instance.
        locale : function (key) {
            if (key === undefined) {
                return this._locale._abbr;
            } else {
                this._locale = moment.localeData(key);
                return this;
            }
        },

        lang : deprecate(
            "moment().lang() is deprecated. Use moment().localeData() instead.",
            function (key) {
                if (key === undefined) {
                    return this.localeData();
                } else {
                    this._locale = moment.localeData(key);
                    return this;
                }
            }
        ),

        localeData : function () {
            return this._locale;
        }
    });

    function rawMonthSetter(mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(),
                daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function rawGetter(mom, unit) {
        return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }

    function rawSetter(mom, unit, value) {
        if (unit === 'Month') {
            return rawMonthSetter(mom, value);
        } else {
            return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    function makeAccessor(unit, keepTime) {
        return function (value) {
            if (value != null) {
                rawSetter(this, unit, value);
                moment.updateOffset(this, keepTime);
                return this;
            } else {
                return rawGetter(this, unit);
            }
        };
    }

    moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
    moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
    moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
    // moment.fn.month is defined separately
    moment.fn.date = makeAccessor('Date', true);
    moment.fn.dates = deprecate('dates accessor is deprecated. Use date instead.', makeAccessor('Date', true));
    moment.fn.year = makeAccessor('FullYear', true);
    moment.fn.years = deprecate('years accessor is deprecated. Use year instead.', makeAccessor('FullYear', true));

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;
    moment.fn.quarters = moment.fn.quarter;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    /************************************
        Duration Prototype
    ************************************/


    function daysToYears (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        return days * 400 / 146097;
    }

    function yearsToDays (years) {
        // years * 365 + absRound(years / 4) -
        //     absRound(years / 100) + absRound(years / 400);
        return years * 146097 / 400;
    }

    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years = 0;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);

            // Accurately convert days to years, assume start from year 0.
            years = absRound(daysToYears(days));
            days -= absRound(yearsToDays(years));

            // 30 days to a month
            // TODO (iskren): Use anchor date (like 1st Jan) to compute this.
            months += absRound(days / 30);
            days %= 30;

            // 12 months -> 1 year
            years += absRound(months / 12);
            months %= 12;

            data.days = days;
            data.months = months;
            data.years = years;
        },

        abs : function () {
            this._milliseconds = Math.abs(this._milliseconds);
            this._days = Math.abs(this._days);
            this._months = Math.abs(this._months);

            this._data.milliseconds = Math.abs(this._data.milliseconds);
            this._data.seconds = Math.abs(this._data.seconds);
            this._data.minutes = Math.abs(this._data.minutes);
            this._data.hours = Math.abs(this._data.hours);
            this._data.months = Math.abs(this._data.months);
            this._data.years = Math.abs(this._data.years);

            return this;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              toInt(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var output = relativeTime(this, !withSuffix, this.localeData());

            if (withSuffix) {
                output = this.localeData().pastFuture(+this, output);
            }

            return this.localeData().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            var days, months;
            units = normalizeUnits(units);

            days = this._days + this._milliseconds / 864e5;
            if (units === 'month' || units === 'year') {
                months = this._months + daysToYears(days) * 12;
                return units === 'month' ? months : months / 12;
            } else {
                days += yearsToDays(this._months / 12);
                switch (units) {
                    case 'week': return days / 7;
                    case 'day': return days;
                    case 'hour': return days * 24;
                    case 'minute': return days * 24 * 60;
                    case 'second': return days * 24 * 60 * 60;
                    case 'millisecond': return days * 24 * 60 * 60 * 1000;
                    default: throw new Error('Unknown unit ' + units);
                }
            }
        },

        lang : moment.fn.lang,
        locale : moment.fn.locale,

        toIsoString : deprecate(
            "toIsoString() is deprecated. Please use toISOString() instead " +
            "(notice the capitals)",
            function () {
                return this.toISOString();
            }
        ),

        toISOString : function () {
            // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
            var years = Math.abs(this.years()),
                months = Math.abs(this.months()),
                days = Math.abs(this.days()),
                hours = Math.abs(this.hours()),
                minutes = Math.abs(this.minutes()),
                seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);

            if (!this.asSeconds()) {
                // this is the same as C#'s (Noda) and python (isodate)...
                // but not other JS (goog.date)
                return 'P0D';
            }

            return (this.asSeconds() < 0 ? '-' : '') +
                'P' +
                (years ? years + 'Y' : '') +
                (months ? months + 'M' : '') +
                (days ? days + 'D' : '') +
                ((hours || minutes || seconds) ? 'T' : '') +
                (hours ? hours + 'H' : '') +
                (minutes ? minutes + 'M' : '') +
                (seconds ? seconds + 'S' : '');
        },

        localeData : function () {
            return this._locale;
        }
    });

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationGetter(i.toLowerCase());
        }
    }

    moment.duration.fn.asMilliseconds = function () {
        return this.as('ms');
    };
    moment.duration.fn.asSeconds = function () {
        return this.as('s');
    };
    moment.duration.fn.asMinutes = function () {
        return this.as('m');
    };
    moment.duration.fn.asHours = function () {
        return this.as('h');
    };
    moment.duration.fn.asDays = function () {
        return this.as('d');
    };
    moment.duration.fn.asWeeks = function () {
        return this.as('weeks');
    };
    moment.duration.fn.asMonths = function () {
        return this.as('M');
    };
    moment.duration.fn.asYears = function () {
        return this.as('y');
    };

    /************************************
        Default Locale
    ************************************/


    // Set default locale, other locale will inherit from English.
    moment.locale('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    /* EMBED_LOCALES */

    /************************************
        Exposing Moment
    ************************************/

    function makeGlobal(shouldDeprecate) {
        /*global ender:false */
        if (typeof ender !== 'undefined') {
            return;
        }
        oldGlobalMoment = globalScope.moment;
        if (shouldDeprecate) {
            globalScope.moment = deprecate(
                    'Accessing Moment through the global scope is ' +
                    'deprecated, and will be removed in an upcoming ' +
                    'release.',
                    moment);
        } else {
            globalScope.moment = moment;
        }
    }

    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    } else if (typeof define === 'function' && define.amd) {
        define('moment', function (require, exports, module) {
            if (module.config && module.config() && module.config().noGlobal === true) {
                // release the global variable
                globalScope.moment = oldGlobalMoment;
            }

            return moment;
        });
        makeGlobal(true);
    } else {
        makeGlobal();
    }
}).call(this);
// moment.js locale configuration
// locale : romanian (ro)
// author : Vlad Gurdiga : https://github.com/gurdiga
// author : Valentin Agachi : https://github.com/avaly

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    function relativeTimeWithPlural(number, withoutSuffix, key) {
        var format = {
                'mm': 'minute',
                'hh': 'ore',
                'dd': 'zile',
                'MM': 'luni',
                'yy': 'ani'
            },
            separator = ' ';
        if (number % 100 >= 20 || (number >= 100 && number % 100 === 0)) {
            separator = ' de ';
        }

        return number + separator + format[key];
    }

    return moment.defineLocale('ro', {
        months : "ianuarie_februarie_martie_aprilie_mai_iunie_iulie_august_septembrie_octombrie_noiembrie_decembrie".split("_"),
        monthsShort : "ian._febr._mart._apr._mai_iun._iul._aug._sept._oct._nov._dec.".split("_"),
        weekdays : "duminică_luni_marți_miercuri_joi_vineri_sâmbătă".split("_"),
        weekdaysShort : "Dum_Lun_Mar_Mie_Joi_Vin_Sâm".split("_"),
        weekdaysMin : "Du_Lu_Ma_Mi_Jo_Vi_Sâ".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY H:mm",
            LLLL : "dddd, D MMMM YYYY H:mm"
        },
        calendar : {
            sameDay: "[azi la] LT",
            nextDay: '[mâine la] LT',
            nextWeek: 'dddd [la] LT',
            lastDay: '[ieri la] LT',
            lastWeek: '[fosta] dddd [la] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "peste %s",
            past : "%s în urmă",
            s : "câteva secunde",
            m : "un minut",
            mm : relativeTimeWithPlural,
            h : "o oră",
            hh : relativeTimeWithPlural,
            d : "o zi",
            dd : relativeTimeWithPlural,
            M : "o lună",
            MM : relativeTimeWithPlural,
            y : "un an",
            yy : relativeTimeWithPlural
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
