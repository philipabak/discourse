define("discourse/helpers/application", 
  ["discourse/helpers/register-unbound","discourse/lib/formatter"],
  function(__dependency1__, __dependency2__) {
    "use strict";
    var registerUnbound = __dependency1__["default"];
    var longDate = __dependency2__.longDate;
    var autoUpdatingRelativeAge = __dependency2__.autoUpdatingRelativeAge;
    var number = __dependency2__.number;

    var safe = Handlebars.SafeString;

    Em.Handlebars.helper('bound-avatar', function (user, size) {
      if (Em.isEmpty(user)) {
        return new safe("<div class='avatar-placeholder'></div>");
      }

      var avatar = Em.get(user, 'avatar_template');
      return new safe(Discourse.Utilities.avatarImg({ size: size, avatarTemplate: avatar }));
    }, 'username', 'avatar_template');

    /*
     * Used when we only have a template
     */
    Em.Handlebars.helper('bound-avatar-template', function (at, size) {
      return new safe(Discourse.Utilities.avatarImg({ size: size, avatarTemplate: at }));
    });

    registerUnbound('raw-date', function (dt) {
      return longDate(new Date(dt));
    });

    registerUnbound('age-with-tooltip', function (dt) {
      return new safe(autoUpdatingRelativeAge(new Date(dt), { title: true }));
    });

    registerUnbound('number', function (orig, params) {
      orig = parseInt(orig, 10);
      if (isNaN(orig)) {
        orig = 0;
      }

      var title = orig;
      if (params.numberKey) {
        title = I18n.t(params.numberKey, { number: orig });
      }

      var classNames = 'number';
      if (params['class']) {
        classNames += ' ' + params['class'];
      }
      var result = "<span class='" + classNames + "'";

      // Round off the thousands to one decimal place
      var n = number(orig);
      if (n !== title) {
        result += " title='" + Handlebars.Utils.escapeExpression(title) + "'";
      }
      result += ">" + n + "</span>";

      return new safe(result);
    });
  });