import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { barcodeDetectorSupported, codeFromScan, scanFromVideo } from '../lib/scanner'
import { isTagCode, normalizeTagCode } from '../lib/code'
import { useT } from '../i18n'
import { Button, Card, Field, FieldError, Notice, TextInput } from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Sectie 8.5 — camera in de werkplaats, maar het invoerveld staat er altijd
 * even groot naast. Het handmatig overtypen van de code is geen noodoplossing.
 */
export default function Scan() {
  const t = useT()
  const navigate = useNavigate()
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!cameraOn) return
    let cancelled = false
    let timer: number | undefined

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return
          const raw = await scanFromVideo(videoRef.current)
          const code = raw ? codeFromScan(raw) : null
          if (code) { navigate(`/W/${code}`); return }
          timer = window.setTimeout(() => { void tick() }, 250)
        }
        void tick()
      } catch {
        setError(t('scan.camera_unavailable'))
        setCameraOn(false)
      }
    }
    void start()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
  }, [cameraOn, navigate, t])

  function openManual() {
    if (!isTagCode(manual)) { setError(t('scan.not_found', { code: manual })); return }
    navigate(`/W/${normalizeTagCode(manual)}`)
  }

  return (
    <div>
      <BackLink to="/" labelKey="back.werkplaats" />
      <h1 className="text-3xl font-semibold mb-4">{t('scan.title')}</h1>
      <p className="mb-4">{t('scan.help')}</p>

      {!barcodeDetectorSupported() && (
        <div className="mb-4"><Notice tone="warn">{t('scan.camera_unavailable')}</Notice></div>
      )}

      <div className="grid gap-3 mb-6">
        <Button
          variant={cameraOn ? 'secondary' : 'primary'}
          full
          disabled={!barcodeDetectorSupported()}
          onClick={() => setCameraOn((v) => !v)}
        >
          {cameraOn ? t('scan.camera_stop') : t('scan.camera')}
        </Button>
      </div>

      {cameraOn && (
        <Card className="mb-6">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full rounded-xl border-2 border-ink bg-black"
          />
        </Card>
      )}

      <Field label={t('scan.manual')} htmlFor="labelcode">
        <TextInput
          id="labelcode"
          value={manual}
          autoComplete="off"
          onChange={(e) => { setManual(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') openManual() }}
          placeholder={t('scan.manual_placeholder')}
          className="text-3xl tracking-widest"
        />
      </Field>
      {error && <FieldError message={error} />}
      <Button full onClick={openManual}>{t('scan.open')}</Button>
    </div>
  )
}
