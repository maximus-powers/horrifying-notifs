$ErrorActionPreference = 'Stop'

# Native Core Audio interfaces; no downloaded module or executable is needed.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class DeviceEnumerator { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, out IAudioEndpointVolume volume);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr properties);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
}

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr callback);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr callback);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float level);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    [PreserveSig] int GetVolumeStepInfo(out uint step, out uint count);
    [PreserveSig] int VolumeStepUp(ref Guid context);
    [PreserveSig] int VolumeStepDown(ref Guid context);
    [PreserveSig] int QueryHardwareSupport(out uint mask);
    [PreserveSig] int GetVolumeRange(out float min, out float max, out float increment);
}

public class VolumeState {
    public string Device;
    public float Volume;
    public bool Muted;
}

public static class AlarmVolume {
    static IAudioEndpointVolume Open(string id, out string actualId) {
        IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)new DeviceEnumerator();
        IMMDevice device;
        if (id == null) Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
        else Marshal.ThrowExceptionForHR(enumerator.GetDevice(id, out device));
        Marshal.ThrowExceptionForHR(device.GetId(out actualId));
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        IAudioEndpointVolume volume;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out volume));
        return volume;
    }

    public static VolumeState Snapshot() {
        VolumeState state = new VolumeState();
        IAudioEndpointVolume volume = Open(null, out state.Device);
        Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out state.Volume));
        Marshal.ThrowExceptionForHR(volume.GetMute(out state.Muted));
        return state;
    }

    public static void Maximize(string id) {
        string actual;
        IAudioEndpointVolume volume = Open(id, out actual);
        Guid context = Guid.Empty;
        Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(1, ref context));
        Marshal.ThrowExceptionForHR(volume.SetMute(false, ref context));
    }

    public static void Restore(string id, float level, bool muted) {
        string actual;
        IAudioEndpointVolume volume = Open(id, out actual);
        Guid context = Guid.Empty;
        try { Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(level, ref context)); }
        finally { Marshal.ThrowExceptionForHR(volume.SetMute(muted, ref context)); }
    }
}
'@

try {
    switch ($env:HORRIFYING_NOTIFS_ACTION) {
        'snapshot' { [AlarmVolume]::Snapshot() | ConvertTo-Json -Compress }
        'maximize' {
            $state = $env:HORRIFYING_NOTIFS_STATE | ConvertFrom-Json
            [AlarmVolume]::Maximize($state.Device)
        }
        'restore' {
            $state = $env:HORRIFYING_NOTIFS_STATE | ConvertFrom-Json
            [AlarmVolume]::Restore($state.Device, [single]$state.Volume, [bool]$state.Muted)
        }
        { $_ -in 'check', 'play' } {
            $player = New-Object System.Media.SoundPlayer
            try {
                $player.SoundLocation = $env:HORRIFYING_NOTIFS_WAV
                $player.Load()
                if ($env:HORRIFYING_NOTIFS_ACTION -eq 'play') { $player.PlaySync() }
            } finally {
                $player.Stop()
                $player.Dispose()
            }
        }
        default { throw 'Unknown alarm helper operation' }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
