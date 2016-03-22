define("discourse/controllers/application", 
  ["ember-addons/ember-computed-decorators","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    function _createDecoratedObject(descriptors) { var target = {}; for (var i = 0; i < descriptors.length; i++) { var descriptor = descriptors[i]; var decorators = descriptor.decorators; var key = descriptor.key; delete descriptor.key; delete descriptor.decorators; descriptor.enumerable = true; descriptor.configurable = true; if ('value' in descriptor || descriptor.initializer) descriptor.writable = true; if (decorators) { for (var f = 0; f < decorators.length; f++) { var decorator = decorators[f]; if (typeof decorator === 'function') { descriptor = decorator(target, key, descriptor) || descriptor; } else { throw new TypeError('The decorator for method ' + descriptor.key + ' is of the invalid type ' + typeof decorator); } } } if (descriptor.initializer) { descriptor.value = descriptor.initializer.call(target); } Object.defineProperty(target, key, descriptor); } return target; }

    var computed = __dependency1__["default"];

    __exports__["default"] = Ember.Controller.extend(_createDecoratedObject([{
      key: 'showTop',
      initializer: function () {
        return true;
      }
    }, {
      key: 'showFooter',
      initializer: function () {
        return false;
      }
    }, {
      key: 'styleCategory',
      initializer: function () {
        return null;
      }
    }, {
      key: 'canSignUp',
      decorators: [computed],
      value: function () {
        return !Discourse.SiteSettings.invite_only && Discourse.SiteSettings.allow_new_registrations && !Discourse.SiteSettings.enable_sso;
      }
    }, {
      key: 'loginRequired',
      decorators: [computed],
      value: function () {
        return Discourse.SiteSettings.login_required && !Discourse.User.current();
      }
    }]));
  });