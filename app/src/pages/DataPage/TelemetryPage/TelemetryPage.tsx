/* eslint-disable react/no-multi-comp */
import { ReactNode } from 'react';
import moment from 'moment-timezone';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Skeleton, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SensorsIcon from '@mui/icons-material/Sensors';
import Header from '../Header.tsx';
import PageContainer from '../../PageContainer.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import BedMap from './BedMap.tsx';
import { Figure, FigureGrid, formatDuration, formatNumber, formatTemp, LiveDot, OutputMeter, Row, Section } from './parts.tsx';
import { Telemetry, useTelemetry } from '@api/telemetry.ts';
import { useSettings } from '@api/settings.ts';
import { COLORS } from '../../../theme.ts';

type Side = 'left' | 'right';
const SIDES: Side[] = ['left', 'right'];
const sideName = (side: Side) => (side === 'left' ? 'Left' : 'Right');
// Older than this, the readings are flagged as stale
const STALE_MS = 2 * 60_000;

const yesNo = (v: boolean | null | undefined, yes = 'Yes', no = 'No') => (v === null || v === undefined ? '—' : v ? yes : no);

const SideColumns = ({ render }: { render: (side: Side) => ReactNode }) => (
  <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2 } }>
    { SIDES.map((side) => (
      <Box key={ side } sx={ { minWidth: 0 } }>
        <Typography sx={ { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, mb: 0.5 } }>{ sideName(side) }</Typography>
        { render(side) }
      </Box>
    )) }
  </Box>
);

const HubSection = ({ t, celsius }: { t: Telemetry; celsius: boolean }) => (
  <Section title="Water & hub" aside={ t.hub.at ? moment(t.hub.at).format('h:mm:ss A') : undefined }>
    <SideColumns
      render={ (side) => {
        const s = t.hub.sides[side];
        return (
          <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1 } }>
            <Figure label="Water" value={ formatTemp(s.waterF, celsius) } note={ `target ${formatTemp(s.targetF, celsius)}` }/>
            <OutputMeter output={ s.enabled === false ? 0 : s.output }/>
            <Typography sx={ { fontSize: 12, color: COLORS.textSecondary, fontVariantNumeric: 'tabular-nums' } }>
            Pump { formatNumber(s.pumpRpm, ' rpm') }
            </Typography>
          </Box>
        );
      } }/>
    <Box sx={ { mt: 2 } }>
      <FigureGrid columns={ 4 }>
        <Figure label="Top fan" value={ formatNumber(t.hub.fanTopRpm) } note="rpm"/>
        <Figure label="Bottom fan" value={ formatNumber(t.hub.fanBottomRpm) } note="rpm"/>
        <Figure label="Hub air" value={ formatTemp(t.hub.airF, celsius) }/>
        <Figure label="Heatsink" value={ formatTemp(t.hub.heatsinkF, celsius) }/>
      </FigureGrid>
    </Box>
    <Box sx={ { mt: 1.5 } }>
      <Row label="Water tank" tone={ t.hub.waterTankOk === false ? 'warn' : 'ok' }>{ yesNo(t.hub.waterTankOk, 'OK', 'Low') }</Row>
      <Row label="Water in the lines" tone={ SIDES.some((s) => t.hub.sides[s].waterDetected === false) ? 'warn' : undefined }>
        { SIDES.map((s) => `${sideName(s)} ${yesNo(t.hub.sides[s].waterDetected)}`).join(' · ') }
      </Row>
      <Row label="Priming" tone={ t.hub.priming ? 'warn' : 'muted' }>
        { t.hub.priming ? 'In progress' : t.hub.needsPrime ? 'Needed' : 'Not needed' }
      </Row>
    </Box>
  </Section>
);

const ControlsSection = ({ t, celsius }: { t: Telemetry; celsius: boolean }) => (
  <Section title="Controls" aside={ t.controls.bedControl ? 'Bed control on' : 'Bed control off' }>
    <SideColumns
      render={ (side) => {
        const c = t.controls.sides[side];
        const button = c.lastButton;
        return (
          <Box>
            <Row label="Power" tone={ c.awayMode || !c.isOn ? 'muted' : 'ok' }>
              { c.awayMode ? 'Away' : c.isOn ? `On · ${formatDuration(c.secondsRemaining)}` : 'Off' }
            </Row>
            <Row label="Setpoint">{ c.setpointF === null ? '—' : formatTemp(c.setpointF, celsius, 0) }</Row>
            <Row label="Learned offset">{ c.offsetF === null ? '—' : `${c.offsetF > 0 ? '+' : ''}${c.offsetF.toFixed(1)}°F` }</Row>
            <Row label="Level">{ c.waterLevel }</Row>
            <Row label="Alarm" tone={ c.isAlarmVibrating ? 'warn' : 'muted' }>{ c.isAlarmVibrating ? 'Vibrating' : 'Idle' }</Row>
            <Row label="Last button" tone={ button ? undefined : 'muted' }>
              { button ? `${button.button} · ${moment(button.at).format('h:mm A')}` : 'None yet' }
            </Row>
            <Row label="Piezo gain">{ formatNumber(c.sensorGain) }</Row>
          </Box>
        );
      } }/>
    <Typography sx={ { mt: 1, fontSize: 11, color: COLORS.textTertiary } }>
      Level is the firmware&apos;s water setting (−100 to 100). Last button resets when free-sleep restarts.
    </Typography>
  </Section>
);

const PodSection = ({ t }: { t: Telemetry }) => {
  const s = t.system;
  const memoryUsed = s.memoryAvailableMB === null ? null : 1 - s.memoryAvailableMB / s.memoryTotalMB;
  return (
    <Section title="Pod">
      <FigureGrid columns={ 3 }>
        <Figure label="Wi-Fi" value={ `${s.wifiStrength}%` }/>
        <Figure label="Processor" value={ s.cpuC === null ? '—' : `${s.cpuC.toFixed(0)}°C` }/>
        <Figure label="Uptime" value={ formatDuration(s.uptimeSeconds) }/>
      </FigureGrid>
      <Box sx={ { mt: 1.5 } }>
        <Row label="Memory in use">
          { memoryUsed === null ? '—' : `${Math.round(memoryUsed * 100)}% of ${(s.memoryTotalMB / 1024).toFixed(1)} GB` }
        </Row>
        <Row label="Storage free">{ s.storageFreeGB === null ? '—' : `${s.storageFreeGB} of ${s.storageTotalGB} GB` }</Row>
        <Row label="Load (1 / 5 / 15 min)">{ s.load.map((l) => l.toFixed(2)).join(' / ') }</Row>
        <Row label="Clock" tone={ s.clockSynced ? 'ok' : 'warn' }>{ s.clockSynced ? 'Synced' : 'Not synced' }</Row>
        <Row label="Cover / hub">{ s.coverVersion } / { s.hubVersion }</Row>
        <Row label="Sensor label">{ s.sensorLabel ?? '—' }</Row>
        <Row label="free-sleep">{ s.freeSleepVersion }</Row>
        <Row label="Blanket accessory" tone="muted">
          { SIDES.every((side) => t.accessories.blanket[side] === false) ? 'Not connected'
            : SIDES.map((side) => `${sideName(side)} ${yesNo(t.accessories.blanket[side], 'connected', 'not connected')}`).join(' · ') }
        </Row>
      </Box>
    </Section>
  );
};

export default function TelemetryPage() {
  const { data: t, isError, dataUpdatedAt } = useTelemetry();
  const { data: settings } = useSettings();
  const celsius = settings?.temperatureFormat === 'celsius';
  const stale = !!t?.cover.at && Date.now() - Date.parse(t.cover.at) > STALE_MS;

  return (
    <PageContainer sx={ { maxWidth: '560px', alignItems: 'stretch', gap: 2, mt: 0 } }>
      <Header title="Telemetry" icon={ <SensorsIcon/> }/>
      <Typography sx={ { fontSize: 12, color: COLORS.textTertiary, textAlign: 'center', mt: -1 } }>
        { t ? (
          <>
            <LiveDot stale={ stale || isError }/>
            { isError ? `Can't reach the Pod · last ${moment(dataUpdatedAt).fromNow()}` : stale
              ? `Sensors last reported ${moment(t.cover.at).fromNow()}`
              : 'Live · every 5 seconds' }
          </>
        ) : 'Loading…' }
      </Typography>

      { isError && !t && <Alert severity="warning">Couldn&apos;t load telemetry from the Pod.</Alert> }
      { !t && !isError && (
        <>
          <Skeleton variant="rounded" height={ 300 } sx={ { borderRadius: '18px', bgcolor: COLORS.surface } }/>
          <Skeleton variant="rounded" height={ 220 } sx={ { borderRadius: '18px', bgcolor: COLORS.surface } }/>
        </>
      ) }

      { t && (
        <ErrorBoundary componentName="Telemetry">
          <Section title="Cover" aside={ t.cover.at ? moment(t.cover.at).format('h:mm:ss A') : undefined }>
            <BedMap telemetry={ t } celsius={ celsius }/>
            <Box sx={ { mt: 2 } }>
              <FigureGrid columns={ 3 }>
                <Figure label="Room" value={ formatTemp(t.cover.roomF, celsius) }/>
                <Figure label="Humidity" value={ t.cover.humidity === null ? '—' : `${t.cover.humidity.toFixed(0)}%` }/>
                <Figure label="Sensor board" value={ formatTemp(t.cover.boardF, celsius) }/>
              </FigureGrid>
            </Box>
            <Typography sx={ { mt: 1.5, fontSize: 11, color: COLORS.textTertiary } }>
              Piezo { t.cover.piezo ? `${t.cover.piezo.sampleRateHz} Hz, gain ${t.cover.piezo.gain}` : 'not reporting' }
              { ' · ' }capacitance { SIDES.map((s) => t.cover.sides[s].capacitance.status ?? '—').join(' / ') }
            </Typography>
          </Section>

          <Box sx={ { display: 'flex', flexDirection: 'column', gap: 2, mt: 2 } }>
            <HubSection t={ t } celsius={ celsius }/>
            <ControlsSection t={ t } celsius={ celsius }/>
            <PodSection t={ t }/>
            <Accordion sx={ { bgcolor: COLORS.surface } }>
              <AccordionSummary expandIcon={ <ExpandMoreIcon/> }>
                <Typography sx={ { fontSize: 15, fontWeight: 600 } }>Raw records</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography sx={ { fontSize: 12, color: COLORS.textTertiary, mb: 1 } }>
                  The newest record of each type from the Pod&apos;s sensor stream, and the firmware&apos;s status reply.
                </Typography>
                <Box
                  component="pre"
                  sx={ {
                    m: 0, p: 1.5, borderRadius: '10px', bgcolor: COLORS.ground, color: COLORS.textSecondary,
                    fontSize: 11, lineHeight: 1.5, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  } }
                >
                  { JSON.stringify(t.raw, null, 2) }
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        </ErrorBoundary>
      ) }
    </PageContainer>
  );
}
