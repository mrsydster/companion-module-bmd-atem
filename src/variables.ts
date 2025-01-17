import { AtemState, Enums } from 'atem-connection'
import InstanceSkel = require('../../../instance_skel')
import { CompanionVariable } from '../../../instance_skel_types'
import { GetSourcesListForType, SourceInfo } from './choices'
import { AtemConfig, PresetStyleName } from './config'
import { ModelSpec } from './models'
import { getDSK, getMixEffect, getSuperSourceBox, getUSK } from './state'
import { pad } from './util'
import { Timecode } from 'atem-connection/dist/state/common'

function getSourcePresetName(instance: InstanceSkel<AtemConfig>, state: AtemState, id: number): string {
	const input = state.inputs[id]
	if (input) {
		return instance.config.presets === PresetStyleName.Long + '' ? input.longName : input.shortName
	} else if (id === 0) {
		return 'Black'
	} else if (id === undefined) {
		return 'Unknown'
	} else {
		return `Unknown input (${id})`
	}
}

export interface UpdateVariablesProps {
	meProgram: Set<number>
	mePreview: Set<number>
	auxes: Set<number>
	dsk: Set<number>
	usk: Set<[me: number, key: number]>
	macros: Set<number>
	ssrc: Set<number>
	mediaPlayer: Set<number>
	streaming: boolean
	recording: boolean
}

type CompanionVariableValues = { [variableId: string]: string | undefined }

export function updateChangedVariables(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	changes: UpdateVariablesProps
): void {
	const newValues: CompanionVariableValues = {}

	for (const meIndex of changes.meProgram) updateMEProgramVariable(instance, state, meIndex, newValues)
	for (const meIndex of changes.mePreview) updateMEPreviewVariable(instance, state, meIndex, newValues)

	for (const auxIndex of changes.auxes) updateAuxVariable(instance, state, auxIndex, newValues)
	for (const dsk of changes.dsk) updateDSKVariable(instance, state, dsk, newValues)
	for (const [meIndex, usk] of changes.usk) updateUSKVariable(instance, state, meIndex, usk, newValues)

	for (const macro of changes.macros) updateMacroVariable(state, macro, newValues)
	for (const ssrc of changes.ssrc) updateSuperSourceVariables(instance, state, ssrc, newValues)
	for (const mp of changes.mediaPlayer) updateMediaPlayerVariables(state, mp, newValues)

	if (changes.recording) updateRecordingVariables(state, newValues)
	if (changes.streaming) updateStreamingVariables(state, newValues)

	if (Object.keys(newValues).length > 0) {
		instance.setVariables(newValues)
	}
}

function updateMEProgramVariable(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	meIndex: number,
	values: CompanionVariableValues
): void {
	const input = getMixEffect(state, meIndex)?.programInput ?? 0
	values[`pgm${meIndex + 1}_input`] = getSourcePresetName(instance, state, input)
}
function updateMEPreviewVariable(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	meIndex: number,
	values: CompanionVariableValues
): void {
	const input = getMixEffect(state, meIndex)?.previewInput ?? 0
	values[`pvw${meIndex + 1}_input`] = getSourcePresetName(instance, state, input)
}

function updateUSKVariable(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	meIndex: number,
	keyIndex: number,
	values: CompanionVariableValues
): void {
	const input = getUSK(state, meIndex, keyIndex)?.fillSource ?? 0
	values[`usk_${meIndex + 1}_${keyIndex + 1}_input`] = getSourcePresetName(instance, state, input)
}
function updateDSKVariable(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	keyIndex: number,
	values: CompanionVariableValues
): void {
	const input = getDSK(state, keyIndex)?.sources?.fillSource ?? 0
	values[`dsk_${keyIndex + 1}_input`] = getSourcePresetName(instance, state, input)
}

function updateAuxVariable(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	auxIndex: number,
	values: CompanionVariableValues
): void {
	const input = state.video.auxilliaries[auxIndex] ?? 0
	values[`aux${auxIndex + 1}_input`] = getSourcePresetName(instance, state, input)
}

function updateMacroVariable(state: AtemState, id: number, values: CompanionVariableValues): void {
	const macro = state.macro.macroProperties[id]
	values[`macro_${id + 1}`] = macro?.name || `Macro ${id + 1}`
}

function updateMediaStillVariable(state: AtemState, id: number, values: CompanionVariableValues): void {
	const still = state.media.stillPool[id]
	values[`still_${id + 1}`] = still?.fileName || `Still ${id + 1}`
}

function updateMediaClipVariable(state: AtemState, id: number, values: CompanionVariableValues): void {
	const clip = state.media.clipPool[id]
	values[`clip_${id + 1}`] = clip?.name || `Clip ${id + 1}`
}

function updateMediaPlayerVariables(state: AtemState, id: number, values: CompanionVariableValues): void {
	const player = state.media.players[id]
	let indexStr = '-1'
	let sourceStr = 'Unknown'
	if (player) {
		if (player.sourceType === Enums.MediaSourceType.Clip) {
			const clip = state.media.clipPool[player.clipIndex]
			indexStr = `C${player.clipIndex + 1}`
			sourceStr = clip?.name || `Clip ${player.clipIndex + 1}`
		} else if (player.sourceType === Enums.MediaSourceType.Still) {
			const still = state.media.stillPool[player.stillIndex]
			indexStr = `S${player.stillIndex + 1}`
			sourceStr = still?.fileName || `Still ${player.stillIndex + 1}`
		}
	}
	values[`mp_index_${id + 1}`] = indexStr
	values[`mp_source_${id + 1}`] = sourceStr
}

function updateInputVariables(src: SourceInfo, values: CompanionVariableValues): void {
	values[`long_${src.id}`] = src.longName
	values[`short_${src.id}`] = src.shortName
}

function formatDuration(durationObj: Timecode | undefined): { hms: string; hm: string; ms: string } {
	let durationHMS = '00:00:00'
	let durationHM = '00:00'
	let durationMS = '00:00'

	if (durationObj) {
		durationHM = `${pad(`${durationObj.hours}`, '0', 2)}:${pad(`${durationObj.minutes}`, '0', 2)}`
		durationHMS = `${durationHM}:${pad(`${durationObj.seconds}`, '0', 2)}`
		durationMS = `${durationObj.hours * 60 + durationObj.minutes}:${pad(`${durationObj.seconds}`, '0', 2)}`
	}

	return { hm: durationHM, hms: durationHMS, ms: durationMS }
}
function formatDurationSeconds(totalSeconds: number | undefined): { hms: string; hm: string; ms: string } {
	let timecode: Timecode | undefined

	if (totalSeconds) {
		timecode = {
			hours: 0,
			minutes: 0,
			seconds: 0,
			frames: 0,
			isDropFrame: false,
		}

		timecode.seconds = totalSeconds % 60
		totalSeconds = Math.floor(totalSeconds / 60)
		timecode.minutes = totalSeconds % 60
		totalSeconds = Math.floor(totalSeconds / 60)
		timecode.hours = totalSeconds
	}

	return formatDuration(timecode)
}

function updateStreamingVariables(state: AtemState, values: CompanionVariableValues): void {
	const bitrate = (state.streaming?.stats?.encodingBitrate ?? 0) / (1024 * 1024)
	const durations = formatDuration(state.streaming?.duration)

	values[`stream_bitrate`] = bitrate.toFixed(2)
	values[`stream_duration_hm`] = durations.hm
	values[`stream_duration_hms`] = durations.hms
	values[`stream_duration_ms`] = durations.ms
}

function updateRecordingVariables(state: AtemState, values: CompanionVariableValues): void {
	const durations = formatDuration(state.recording?.duration)
	const remaining = formatDurationSeconds(state.recording?.status?.recordingTimeAvailable)

	values['record_duration_hm'] = durations.hm
	values['record_duration_hms'] = durations.hms
	values['record_duration_ms'] = durations.ms
	values['record_remaining_hm'] = remaining.hm
	values['record_remaining_hms'] = remaining.hms
	values['record_remaining_ms'] = remaining.ms
}

function updateSuperSourceVariables(
	instance: InstanceSkel<AtemConfig>,
	state: AtemState,
	i: number,
	values: CompanionVariableValues
): void {
	for (let b = 0; b < 4; b++) {
		const input = getSuperSourceBox(state, b, i)?.source ?? 0
		values[`ssrc${i + 1}_box${b + 1}_source`] = getSourcePresetName(instance, state, input)
	}
}

export function InitVariables(instance: InstanceSkel<AtemConfig>, model: ModelSpec, state: AtemState): void {
	const variables: CompanionVariable[] = []

	const values: CompanionVariableValues = {}

	// PGM/PV busses
	for (let i = 0; i < model.MEs; ++i) {
		variables.push({
			label: `Label of input active on program bus (M/E ${i + 1})`,
			name: `pgm${i + 1}_input`,
		})
		updateMEProgramVariable(instance, state, i, values)

		variables.push({
			label: `Label of input active on preview bus (M/E ${i + 1})`,
			name: `pvw${i + 1}_input`,
		})
		updateMEPreviewVariable(instance, state, i, values)

		for (let k = 0; k < model.USKs; ++k) {
			variables.push({
				label: `Label of input active on M/E ${i + 1} Key ${k + 1}`,
				name: `usk_${i + 1}_${k + 1}_input`,
			})

			updateUSKVariable(instance, state, i, k, values)
		}
	}

	// Auxs
	for (let a = 0; a < model.auxes; ++a) {
		variables.push({
			label: `Label of input active on Aux ${a + 1}`,
			name: `aux${a + 1}_input`,
		})

		updateAuxVariable(instance, state, a, values)
	}

	// DSKs
	for (let k = 0; k < model.DSKs; ++k) {
		variables.push({
			label: `Label of input active on DSK ${k + 1}`,
			name: `dsk_${k + 1}_input`,
		})

		updateDSKVariable(instance, state, k, values)
	}

	// Source names
	for (const src of GetSourcesListForType(model, state)) {
		variables.push({
			label: `Long name of source id ${src.id}`,
			name: `long_${src.id}`,
		})
		variables.push({
			label: `Short name of source id ${src.id}`,
			name: `short_${src.id}`,
		})

		updateInputVariables(src, values)
	}

	// Macros
	for (let i = 0; i < model.macros; i++) {
		variables.push({
			label: `Name of macro #${i + 1}`,
			name: `macro_${i + 1}`,
		})

		updateMacroVariable(state, i, values)
	}

	// Media
	for (let i = 0; i < model.media.stills; i++) {
		variables.push({
			label: `Name of still #${i + 1}`,
			name: `still_${i + 1}`,
		})

		updateMediaStillVariable(state, i, values)
	}
	for (let i = 0; i < model.media.clips; i++) {
		variables.push({
			label: `Name of clip #${i + 1}`,
			name: `clip_${i + 1}`,
		})

		updateMediaClipVariable(state, i, values)
	}
	for (let i = 0; i < model.media.players; i++) {
		variables.push({
			label: `Name of media player source #${i + 1}`,
			name: `mp_source_${i + 1}`,
		})
		variables.push({
			label: `Name of media player index #${i + 1}`,
			name: `mp_index_${i + 1}`,
		})

		updateMediaPlayerVariables(state, i, values)
	}

	if (model.streaming) {
		variables.push({
			label: 'Streaming bitrate in MB/s',
			name: 'stream_bitrate',
		})
		variables.push({
			label: 'Streaming duration (hh:mm)',
			name: 'stream_duration_hm',
		})
		variables.push({
			label: 'Streaming duration (hh:mm:ss)',
			name: 'stream_duration_hms',
		})
		variables.push({
			label: 'Streaming duration (mm:ss)',
			name: 'stream_duration_ms',
		})

		updateStreamingVariables(state, values)
	}

	if (model.recording) {
		variables.push({
			label: 'Recording duration (hh:mm)',
			name: 'record_duration_hm',
		})
		variables.push({
			label: 'Recording duration (hh:mm:ss)',
			name: 'record_duration_hms',
		})
		variables.push({
			label: 'Recording duration (mm:ss)',
			name: 'record_duration_ms',
		})

		variables.push({
			label: 'Recording time remaining (hh:mm)',
			name: 'record_remaining_hm',
		})
		variables.push({
			label: 'Recording time remaining (hh:mm:ss)',
			name: 'record_remaining_hms',
		})
		variables.push({
			label: 'Recording time remaining (mm:ss)',
			name: 'record_remaining_ms',
		})

		updateRecordingVariables(state, values)
	}

	// Supersource
	for (let i = 0; i < model.SSrc; i++) {
		for (let b = 0; b < 4; b++) {
			variables.push({
				label: `Supersource ${i + 1} Box ${b + 1} source`,
				name: `ssrc${i + 1}_box${b + 1}_source`,
			})
		}

		updateSuperSourceVariables(instance, state, i, values)
	}

	instance.setVariableDefinitions(variables)
	instance.setVariables(values)
}
