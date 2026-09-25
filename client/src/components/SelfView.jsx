import { useEffect, useRef } from 'react';

export function attachSelfView(videoElement, track, createStream = (tracks) => new MediaStream(tracks)) {
  const stream = track ? createStream([track]) : null;
  videoElement.muted = true;
  videoElement.srcObject = stream;
  return () => {
    if (videoElement.srcObject === stream) videoElement.srcObject = null;
  };
}

export function SelfView({ displayName, videoTrack }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return undefined;
    return attachSelfView(videoRef.current, videoTrack);
  }, [videoTrack]);

  return (
    <section className="self-view" aria-label="Ваше видео">
      {videoTrack ? (
        <video ref={videoRef} className="self-view-video" autoPlay playsInline muted />
      ) : (
        <div className="self-view-placeholder" aria-hidden="true">👤</div>
      )}
      <div className="self-view-caption">
        <strong>{displayName}</strong>
        <span>Вы</span>
      </div>
    </section>
  );
}
