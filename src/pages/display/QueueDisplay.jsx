import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Clock3, HeartPulse } from 'lucide-react';

import {
  getQueue,
  subscribeToQueue,
} from '../../services/queueService';

const QUEUE_REFRESH_INTERVAL_MS = 15_000;

export default function QueueDisplay() {
  const [rows, setRows] = useState([]);
  const [now, setNow] = useState(new Date());

  const load = useCallback(
    () => getQueue().then(setRows).catch(console.error),
    [],
  );

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    load();
    const unsubscribe = subscribeToQueue(load);
    const clock = setInterval(() => setNow(new Date()), 1000);
    // Realtime provides immediate updates; this keeps unattended displays in
    // sync even if an event is missed or Realtime is unavailable.
    const queueRefresh = setInterval(load, QUEUE_REFRESH_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(clock);
      clearInterval(queueRefresh);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [load]);

  const lanes = useMemo(() => {
    const groupedLanes = {};

    rows
      .filter((row) => ['Waiting', 'Serving'].includes(row.status))
      .forEach((row) => {
      const doctor = row.veterinarian?.full_name || 'Veterinarian';
      (groupedLanes[doctor] ??= []).push(row);
      });

    return Object.entries(groupedLanes);
  }, [rows]);

  return (
    <>
      <style>{`
        .queue-display,
        .queue-display * {
          box-sizing: border-box;
        }

        html:has(.queue-display),
        body:has(.queue-display),
        #root:has(.queue-display) {
          width: 100%;
          height: 100%;
          max-height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden !important;
        }

        .queue-display {
          width: 100%;
          height: auto;
          min-height: 0;
          max-height: 100vh;
          max-height: 100dvh;
          position: fixed;
          inset: 0;
          overflow: hidden;

          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: clamp(14px, 2vh, 22px);
          padding: clamp(16px, 2vw, 28px);

          color: #12394f;
          background:
            radial-gradient(
              circle at 10% 10%,
              rgba(143, 221, 255, 0.48),
              transparent 34%
            ),
            radial-gradient(
              circle at 92% 88%,
              rgba(24, 99, 160, 0.45),
              transparent 38%
            ),
            linear-gradient(135deg, #dff5ff 0%, #82c8e9 48%, #236b9e 100%);
          font-family: Arial, Helvetica, sans-serif;
        }

        .queue-display-header {
          min-height: clamp(88px, 11vh, 120px);
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 24px;
          padding: 16px clamp(22px, 3vw, 42px);

          border: 1px solid rgba(255, 255, 255, 0.58);
          border-radius: 26px;
          background: linear-gradient(
            115deg,
            rgba(14, 68, 99, 0.82),
            rgba(28, 104, 143, 0.7)
          );
          box-shadow:
            0 18px 45px rgba(7, 46, 76, 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
        }

        .queue-display-brand {
          display: inline-flex;
          align-items: center;
          gap: 13px;
          justify-self: start;
          color: #ffffff;
        }

        .queue-display-brand-icon {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          color: #217fae;
          border: 1px solid rgba(255, 255, 255, 0.78);
          border-radius: 18px;
          background: rgba(248, 253, 255, 0.95);
          box-shadow: 0 8px 22px rgba(4, 31, 48, 0.2);
        }

        .queue-display-brand strong {
          display: block;
          font-size: clamp(23px, 2vw, 31px);
          line-height: 1;
        }

        .queue-display-brand small {
          display: block;
          margin-top: 4px;
          color: #d8f4ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .queue-display-title {
          min-width: max-content;
          text-align: center;
        }

        .queue-display-title h1 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(30px, 3.2vw, 48px);
          line-height: 1;
          letter-spacing: -1.2px;
        }

        .queue-display-title p {
          margin: 7px 0 0;
          color: #d9f3ff;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 1.7px;
          text-transform: uppercase;
        }

        .queue-display-clock {
          justify-self: end;
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 230px;
          padding: 12px 17px;

          color: #f6fcff;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 16px;
          background: rgba(8, 45, 69, 0.28);
        }

        .queue-display-clock svg {
          flex: 0 0 auto;
          color: #86d8ff;
        }

        .queue-display-clock strong,
        .queue-display-clock span {
          display: block;
          white-space: nowrap;
        }

        .queue-display-clock strong {
          font-size: clamp(18px, 1.7vw, 25px);
        }

        .queue-display-clock span {
          margin-top: 2px;
          color: #d7f2ff;
          font-size: 12px;
          font-weight: 700;
        }

        .queue-lanes {
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
          grid-auto-rows: minmax(0, 1fr);
          gap: clamp(18px, 2vw, 30px);
        }

        .queue-lane,
        .queue-empty {
          min-width: 0;
          min-height: 0;
          position: relative;
          overflow: hidden;

          border: 1px solid rgba(255, 255, 255, 0.86);
          border-radius: clamp(24px, 2.3vw, 34px);
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.95),
            rgba(226, 245, 253, 0.9)
          );
          box-shadow:
            0 24px 58px rgba(7, 53, 87, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(13px);
          -webkit-backdrop-filter: blur(13px);
        }

        .queue-lane {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          padding: clamp(22px, 2.5vw, 36px);
        }

        .queue-lane::before {
          content: '';
          height: 7px;
          position: absolute;
          top: 0;
          right: 0;
          left: 0;
          background: linear-gradient(90deg, #51b8e6, #176c9b);
        }

        .queue-lane-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding-bottom: clamp(14px, 2vh, 22px);
          border-bottom: 1px solid rgba(55, 132, 168, 0.18);
        }

        .queue-lane-header h2 {
          margin: 0;
          color: #163d53;
          font-size: clamp(25px, 2.5vw, 38px);
          line-height: 1.1;
          letter-spacing: -0.7px;
        }

        .queue-live-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          color: #0e6c91;
          background: #dcf4ff;
          border: 1px solid #b9e6f7;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .queue-live-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #27a7dc;
          box-shadow: 0 0 0 4px rgba(39, 167, 220, 0.14);
        }

        .queue-serving {
          min-height: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: clamp(12px, 2vh, 22px) 0;
          text-align: center;
        }

        .queue-serving-label {
          margin: 0;
          color: #2384b0;
          font-size: clamp(14px, 1.4vw, 19px);
          font-weight: 900;
          letter-spacing: 2.4px;
          text-transform: uppercase;
        }

        .queue-serving-number {
          margin: clamp(5px, 1vh, 10px) 0;
          color: #155e89;
          font-size: clamp(76px, 9vw, 142px);
          line-height: 0.9;
          letter-spacing: -5px;
          text-shadow: 0 8px 26px rgba(34, 126, 170, 0.18);
        }

        .queue-serving-pet {
          margin: 0;
          color: #385c70;
          font-size: clamp(18px, 2vw, 29px);
          line-height: 1.15;
        }

        .queue-next {
          padding: clamp(14px, 1.7vw, 22px);
          border: 1px solid rgba(84, 166, 201, 0.24);
          border-radius: 19px;
          background: rgba(218, 241, 251, 0.72);
        }

        .queue-next-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 10px;
          color: #315e74;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .queue-next-title span {
          color: #7293a3;
          font-size: 11px;
          letter-spacing: 0;
        }

        .queue-next-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .queue-next-item,
        .queue-next-empty {
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          color: #24526a;
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid rgba(105, 183, 215, 0.28);
          border-radius: 11px;
          font-size: clamp(13px, 1.2vw, 17px);
          font-weight: 800;
          text-align: center;
        }

        .queue-next-empty {
          grid-column: 1 / -1;
          color: #6b8998;
        }

        .queue-empty {
          display: grid;
          place-items: center;
          padding: 40px;
          text-align: center;
        }

        .queue-empty-icon {
          width: 100px;
          height: 100px;
          display: grid;
          place-items: center;
          margin: 0 auto 18px;
          color: #2384b0;
          background: #dff4fc;
          border: 1px solid #bee5f3;
          border-radius: 30px;
        }

        .queue-empty h2 {
          margin: 0;
          color: #183f55;
          font-size: clamp(30px, 4vw, 52px);
        }

        .queue-empty p {
          margin: 10px 0 0;
          color: #668493;
          font-size: 18px;
        }

        @media (max-width: 900px) {
          .queue-display-header {
            grid-template-columns: 1fr auto;
          }

          .queue-display-title {
            display: none;
          }

          .queue-lanes {
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          }

          .queue-serving-number {
            font-size: clamp(62px, 12vw, 104px);
          }
        }

        @media (max-width: 620px) {
          .queue-display {
            gap: 10px;
            padding: 10px;
          }

          .queue-display-header {
            min-height: 72px;
            padding: 10px 14px;
            border-radius: 18px;
          }

          .queue-display-brand-icon {
            width: 44px;
            height: 44px;
            border-radius: 14px;
          }

          .queue-display-brand-icon svg {
            width: 27px;
            height: 27px;
          }

          .queue-display-brand strong {
            font-size: 20px;
          }

          .queue-display-brand small,
          .queue-display-clock span {
            display: none;
          }

          .queue-display-clock {
            min-width: 0;
            padding: 8px 10px;
          }

          .queue-display-clock strong {
            font-size: 15px;
          }

          .queue-lanes {
            gap: 10px;
          }

          .queue-lane {
            padding: 16px;
            border-radius: 19px;
          }

          .queue-lane-header {
            padding-bottom: 9px;
          }

          .queue-lane-header h2 {
            font-size: 20px;
          }

          .queue-live-badge {
            padding: 6px 8px;
            font-size: 9px;
          }

          .queue-serving {
            padding: 6px 0;
          }

          .queue-serving-number {
            margin: 3px 0;
            font-size: clamp(50px, 16vw, 78px);
            letter-spacing: -2px;
          }

          .queue-serving-pet {
            font-size: 16px;
          }

          .queue-next {
            padding: 9px;
            border-radius: 13px;
          }

          .queue-next-item,
          .queue-next-empty {
            min-height: 32px;
            padding: 5px 7px;
            font-size: 11px;
          }
        }

        @media (max-height: 700px) and (min-width: 621px) {
          .queue-display {
            gap: 12px;
            padding: 14px;
          }

          .queue-display-header {
            min-height: 78px;
          }

          .queue-lane {
            padding: 20px;
          }

          .queue-lane-header {
            padding-bottom: 10px;
          }

          .queue-serving {
            padding: 7px 0;
          }

          .queue-serving-number {
            font-size: clamp(65px, 8vw, 100px);
          }

          .queue-next {
            padding: 11px;
          }

          .queue-next-item,
          .queue-next-empty {
            min-height: 34px;
          }
        }
      `}</style>

      <div className='queue-display'>
        <header className='queue-display-header'>
          <div className='queue-display-brand'>
            <span className='queue-display-brand-icon'>
              <HeartPulse size={35} strokeWidth={2.3} />
            </span>

            <span>
              <strong>PawCruz</strong>
              <small>Cruz Veterinary Clinic</small>
            </span>
          </div>

          <div className='queue-display-title'>
            <h1>Queue Display</h1>
            <p>Live Patient Queue</p>
          </div>

          <div className='queue-display-clock'>
            <Clock3 size={28} strokeWidth={2.1} />
            <div>
              <strong>
                {now.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </strong>
              <span>
                {now.toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </header>

        <main className='queue-lanes'>
          {lanes.map(([doctor, list]) => {
            const serving = list.find(
              (row) => row.status === 'Serving',
            );
            const waiting = list.filter(
              (row) => row.status === 'Waiting',
            );

            return (
              <section className='queue-lane' key={doctor}>
                <header className='queue-lane-header'>
                  <h2>{doctor}</h2>
                  <span className='queue-live-badge'>
                    <span className='queue-live-dot' />
                    Live Queue
                  </span>
                </header>

                <div className='queue-serving'>
                  <p className='queue-serving-label'>Now Serving</p>
                  <strong className='queue-serving-number'>
                    {serving?.queue_number || '---'}
                  </strong>
                  <h3 className='queue-serving-pet'>
                    {serving
                      ? (serving.pets?.length
                        ? serving.pets.map((pet) => pet.pet_name).join(', ')
                        : serving.pet?.pet_name)
                      : 'Waiting for next patient'}
                  </h3>
                </div>

                <div className='queue-next'>
                  <div className='queue-next-title'>
                    <b>Next in Queue</b>
                    <span>{waiting.length} waiting</span>
                  </div>

                  <div className='queue-next-list'>
                    {waiting.slice(0, 5).map((row) => (
                      <span className='queue-next-item' key={row.id}>
                        {row.queue_number} • {row.pets?.length
                          ? row.pets.map((pet) => pet.pet_name).join(', ')
                          : (row.pet?.pet_name || 'Pet')}
                      </span>
                    ))}

                    {waiting.length === 0 && (
                      <span className='queue-next-empty'>
                        No patients waiting
                      </span>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          {lanes.length === 0 && (
            <section className='queue-empty'>
              <div>
                <span className='queue-empty-icon'>
                  <HeartPulse size={54} strokeWidth={2} />
                </span>
                <h2>No active queue</h2>
                <p>The next patient will appear here automatically.</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
