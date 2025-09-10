import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="relative">
        <select
          onChange={(e) => changeLanguage(e.target.value)}
          defaultValue={i18n.language}
          className="p-2 bg-green-800 text-white rounded-full appearance-none"
        >
          <option value="en">EN</option>
          <option value="fr">FR</option>
        </select>
    </div>
  );
};

export default LanguageSelector;
