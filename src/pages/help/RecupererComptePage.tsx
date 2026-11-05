import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, AlertTriangle } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TermTooltip from '../../components/TermTooltip';

const RecupererComptePage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.recupererCompte.title')} — Movix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      titleKey: 'help.recupererCompte.warningTitle',
      bodyKey: 'help.recupererCompte.warningBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-red-400" />,
      components: {
        1: <TermTooltip tooltipKey="help.glossary.seed" />,
        2: <TermTooltip tooltipKey="help.glossary.bip39" />,
      },
    },
    { kind: 'text', titleKey: 'help.recupererCompte.whyTitle', bodyKey: 'help.recupererCompte.whyBody' },
    { kind: 'text', titleKey: 'help.recupererCompte.ifLostTitle', bodyKey: 'help.recupererCompte.ifLostBody' },
    { kind: 'text', titleKey: 'help.recupererCompte.preventTitle', bodyKey: 'help.recupererCompte.preventBody' },
    { kind: 'text', titleKey: 'help.recupererCompte.supportTitle', bodyKey: 'help.recupererCompte.supportBody' },
  ];

  return (
    <TutoLayout
      icon={<KeyRound className="w-10 h-10 text-red-400" />}
      title={t('help.recupererCompte.title')}
      heroSub={t('help.recupererCompte.heroSub')}
      sections={sections}
    />
  );
};

export default RecupererComptePage;
