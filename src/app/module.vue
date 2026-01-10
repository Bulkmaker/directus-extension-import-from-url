<template>
	<private-view :title="t('title')">
		<template #navigation>
			<v-list nav>
				<v-list-item
					v-for="nav in navigation"
					:key="nav.id"
					:active="activeTab === nav.id"
					@click="activeTab = nav.id"
				>
					<v-list-item-icon><v-icon :name="nav.icon" /></v-list-item-icon>
					<v-list-item-content><v-list-item-title>{{ nav.name }}</v-list-item-title></v-list-item-content>
				</v-list-item>
			</v-list>
		</template>

		<div class="content">
			<div v-if="activeTab === 'profiles'" class="tab-content">
				<v-notice v-if="profiles.length === 0" type="info">{{ t('no_profiles') }}</v-notice>

				<div v-else class="profiles-list">
					<v-card v-for="profile in profiles" :key="profile.id" class="mb-10">
						<v-card-text class="profile-card-enhanced">
							<div class="profile-main">
								<div class="profile-header">
									<div class="profile-name">{{ profile.name }}</div>
									<div class="profile-badges">
										<v-chip x-small outlined>{{ profile.collection }}</v-chip>
										<v-chip x-small :class="profile.mode === 'upsert' ? 'chip-warning' : 'chip-info'">
											{{ profile.mode === 'upsert' ? t('mode_upsert') : t('mode_insert') }}
										</v-chip>
									</div>
								</div>
								<div class="profile-stats">
									<div class="stat-item">
										<span class="stat-label">{{ t('last_run') }}:</span>
										<span class="stat-value">{{ profile.last_run ? formatDate(profile.last_run) : t('never_run') }}</span>
									</div>
									<div v-if="profile.last_report" class="stat-item">
										<span class="stat-label">{{ t('success_count') }}:</span>
										<span class="stat-value success">{{ profile.last_report.success || 0 }}</span>
										<span class="stat-label ml-10">{{ t('error_count') }}:</span>
										<span class="stat-value" :class="profile.last_report.errors > 0 ? 'error' : ''">{{ profile.last_report.errors || 0 }}</span>
									</div>
									<div v-if="profile.last_status" class="stat-item">
										<v-icon :name="profile.last_status === 'success' ? 'check_circle' : 'warning'"
											:class="profile.last_status === 'success' ? 'status-success' : 'status-warning'" small />
									</div>
								</div>
							</div>
							<div class="profile-actions">
								<v-button x-small secondary icon @click="editProfile(profile)" v-tooltip="t('edit')"><v-icon name="edit" /></v-button>
								<v-button x-small secondary icon @click="deleteProfile(profile.id)" v-tooltip="t('delete')"><v-icon name="delete" /></v-button>
								<v-button x-small @click="runProfile(profile.id)" :loading="runningProfile === profile.id">{{ t('run_now') }}</v-button>
							</div>
						</v-card-text>
					</v-card>
				</div>
			</div>

			<div v-if="activeTab === 'import'" class="tab-content">
				<v-card v-if="step === 1">
					<v-card-text>
						<div class="field-group mb-20">
							<label class="type-label">{{ t('source_url') }}</label>
							<v-input v-model="form.url" placeholder="https://docs.google.com/spreadsheets/d/..." />
							<div class="type-note">{{ t('source_url_note') }}</div>
						</div>

						<div class="grid mb-20" style="--theme--form--field--input--height: 60px;">
							<div class="field-group">
								<label class="type-label">{{ t('target_collection') }}</label>
								<v-select 
									v-model="form.collection" 
									:items="collectionItems" 
									:placeholder="t('select_collection')"
								/>
							</div>
							<div class="field-group">
								<label class="type-label">{{ t('delimiter') }}</label>
								<v-select v-model="form.delimiter" :items="delimiterItems" />
							</div>
						</div>

						<div class="mb-20">
							<v-checkbox v-model="form.has_header" :label="t('has_header')" />
						</div>
						<v-button @click="fetchPreview" :loading="loading" :disabled="!form.url || !form.collection" class="mt-20">{{ t('continue_preview') }}</v-button>
					</v-card-text>
				</v-card>

				<v-card v-if="step === 2">
					<v-card-text>
						<v-notice type="info" class="mb-20">{{ t('step_2_title') }}</v-notice>
						
						<div v-if="previewData.sheets && previewData.sheets.length > 0" class="field-group mb-20">
							<label class="type-label">{{ t('select_sheet') }}</label>
							<v-select 
								v-model="form.sheet_name" 
								:items="sheetItems" 
								@update:model-value="fetchPreview"
							/>
						</div>
						
						<div class="table-container mb-20">
							<table class="preview-table">
								<thead>
									<tr>
										<th v-for="h in previewData.headers" :key="h">{{ h }}</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="(row, i) in previewData.preview" :key="i">
										<td v-for="h in previewData.headers" :key="h">{{ row[h] }}</td>
									</tr>
								</tbody>
							</table>
						</div>

						<div class="import-settings mb-20">
							<h3>{{ t('import_settings') }}</h3>
							<div class="grid mt-10">
								<v-field :label="t('profile_name')">
									<v-input v-model="form.name" :placeholder="t('profile_name_placeholder')" />
								</v-field>
								<v-field :label="t('import_mode')">
									<v-select v-model="form.mode" :items="modeItems" />
								</v-field>
							</div>
							<div class="mt-10">
								<v-checkbox v-model="form.skip_empty_values" :label="t('skip_empty')" />
								<v-checkbox v-model="form.force_publish" :label="t('force_publish')" />
							</div>
							<div v-if="form.mode === 'upsert'" class="grid mt-10">
								<v-field :label="t('csv_column_key')">
									<v-select v-model="form.match_source" :items="sourceFieldItems" :placeholder="t('select_column')" />
								</v-field>
								<v-field :label="t('collection_field_match')">
									<v-select v-model="form.match_field" :items="fieldItems" :placeholder="t('select_field')" />
								</v-field>
							</div>
						</div>

						<!-- Gallery Import Settings -->
						<div v-if="hasGalleryMappings" class="gallery-settings mb-20">
							<h3>{{ t('gallery_settings') }}</h3>
							<div class="grid mt-10">
								<v-field :label="t('gallery_mode')">
									<v-select
										v-model="form.gallery_options.mode"
										:items="[
											{ text: t('gallery_mode_replace'), value: 'replace' },
											{ text: t('gallery_mode_append'), value: 'append' },
											{ text: t('gallery_mode_skip'), value: 'skip_existing' }
										]"
									/>
									<span class="type-note">{{ t('gallery_mode_note') }}</span>
								</v-field>
								<v-field :label="t('gallery_delimiter')">
									<v-input v-model="form.gallery_options.delimiter" placeholder="," />
									<span class="type-note">{{ t('gallery_delimiter_note') }}</span>
								</v-field>
							</div>
							<div class="grid mt-10">
								<v-field :label="t('gallery_base_url')">
									<v-input v-model="form.gallery_options.base_url" :placeholder="t('gallery_base_url_placeholder')" />
									<span class="type-note">{{ t('gallery_base_url_note') }}</span>
								</v-field>
							</div>
							<div class="mt-10">
								<v-checkbox v-model="form.gallery_options.skip_errors" :label="t('gallery_skip_errors')" />
							</div>
						</div>

						<div class="defaults-settings mb-20">
							<h3>{{ t('default_values') }}</h3>
							<v-notice v-if="Object.keys(form.defaults).length === 0" type="info" class="mb-10">
								{{ t('no_defaults') }}
							</v-notice>
							
							<div class="defaults-list">
								<div v-for="(val, fieldName) in form.defaults" :key="fieldName" class="default-row">
									<div class="field-name">{{ getFieldTitle(fieldName) }}</div>
									<div class="field-input">
										<v-select 
											v-if="getFieldInputType(fieldName) === 'select'"
											v-model="form.defaults[fieldName]"
											:items="getFieldOptions(fieldName)"
											:placeholder="t('select_value')"
										/>
										<v-checkbox 
											v-else-if="getFieldInputType(fieldName) === 'checkbox'"
											v-model="form.defaults[fieldName]"
											:label="t('enabled')"
										/>
										<v-input 
											v-else
											v-model="form.defaults[fieldName]" 
											:placeholder="t('default_value_placeholder')" 
										/>
									</div>
									<v-button x-small icon secondary @click="removeDefaultField(fieldName)">
										<v-icon name="close" />
									</v-button>
								</div>
							</div>

							<div class="add-default mt-10">
								<v-menu show-arrow placement="bottom-start">
									<template #activator="{ toggle }">
										<v-button secondary small @click="toggle">
											<v-icon name="add" left />
											{{ t('add_default_field') }}
										</v-button>
									</template>
									<v-list>
										<v-list-item 
											v-for="field in availableDefaultFields" 
											:key="field.value"
											@click="addDefaultField(field.value)"
										>
											<v-list-item-content>{{ field.text }}</v-list-item-content>
										</v-list-item>
									</v-list>
								</v-menu>
							</div>
						</div>

						<h3>{{ t('field_mapping') }}</h3>
						<div class="mapping-grid mt-10">
							<div v-for="header in previewData.headers" :key="header" class="mapping-row">
								<span class="column-name">{{ header }}</span>
								<v-icon name="arrow_forward" />
								<v-select 
									v-model="form.mapping[header]" 
									:items="fieldItems" 
									:placeholder="t('skip_column')"
									show-deselect
								/>
							</div>
						</div>

						<div class="actions mt-20">
							<v-button secondary @click="step = 1">{{ t('back') }}</v-button>
							<v-button secondary @click="saveProfile" :loading="loading">{{ editingProfileId ? t('update_profile') : t('save_profile') }}</v-button>
							<v-button secondary @click="startDryRun" :loading="loading && isDryRun">{{ t('dry_run') }}</v-button>
							<v-button @click="startImport" :loading="loading && !isDryRun">{{ t('run_import') }}</v-button>
						</div>
					</v-card-text>
				</v-card>

				<v-card v-if="step === 3">
					<v-card-text>
						<v-info
							:title="importResult.dry_run ? t('dry_run_title') : t('import_complete')"
							:type="importResult.dry_run ? 'info' : (importResult.errors > 0 ? 'warning' : 'success')"
							:icon="importResult.dry_run ? 'science' : (importResult.errors > 0 ? 'warning' : 'check_circle')"
						/>
						<div v-if="importResult.dry_run" class="dry-run-notice mt-20">
							<v-notice type="info">{{ t('dry_run_desc') }}</v-notice>
						</div>
						<div class="mt-20">
							<p>{{ t('processed') }}: {{ importResult.success + importResult.errors }} {{ t('rows') }}</p>
							<p>{{ t('success_count') }}: {{ importResult.success }}</p>
							<p>{{ t('error_count') }}: {{ importResult.errors }}</p>
						</div>
						<div v-if="importResult.warnings && importResult.warnings.length > 0" class="mt-20">
							<h4>{{ t('warning_details') }}: ({{ importResult.warnings.length }})</h4>
							<ul class="warnings-list">
								<li v-for="(warn, i) in importResult.warnings.slice(0, 20)" :key="i" class="warning-item">
									<strong>{{ t('row') }} {{ warn.row_index }}:</strong> {{ warn.warning }}
								</li>
							</ul>
						</div>
						<div v-if="importResult.details && importResult.details.length > 0" class="mt-10">
							<h4>{{ t('error_details') }}: ({{ importResult.details.length }})</h4>
							<ul>
								<li v-for="(err, i) in importResult.details.slice(0, 20)" :key="i" class="mb-20 error-item">
									<div class="error-header">
										<strong>{{ t('row') }} {{ err.row_index }}:</strong> 
										<span class="error-msg">{{ err.error }}</span>
										<v-chip v-if="err.code" x-small outlined class="ml-10">{{ err.code }}</v-chip>
									</div>

									<div v-if="err.validation && err.validation.length > 0" class="validation-errors mt-10">
										<v-notice type="danger" icon="error" dense>
											<ul class="validation-list">
												<li v-for="(v, k) in err.validation" :key="k">
													<strong>{{ v.field }}:</strong> {{ v.message }}
												</li>
											</ul>
										</v-notice>
									</div>

									<div class="debug-data mt-5">
										<details>
											<summary class="subdued">{{ t('show_debug') }}</summary>
											<div class="debug-content mt-5">
												<div class="code-block mb-5">
													<strong>Payload:</strong>
													<pre>{{ JSON.stringify(err.payload_sent, null, 2) }}</pre>
												</div>
												<div class="code-block">
													<strong>Original:</strong>
													<pre>{{ JSON.stringify(err.original_data, null, 2) }}</pre>
												</div>
											</div>
										</details>
									</div>
								</li>
							</ul>
						</div>
						<v-button class="mt-20" @click="reset">{{ t('start_new') }}</v-button>
					</v-card-text>
				</v-card>
			</div>

			<div v-if="activeTab === 'history'" class="tab-content">
				<v-notice v-if="history.length === 0" type="info">{{ t('no_history') }}</v-notice>

				<div v-else class="history-list">
					<v-card v-for="job in history" :key="job.id" class="history-card mb-10">
						<v-card-text>
							<div class="history-header" @click="toggleJobDetails(job.id)">
								<div class="history-main">
									<div class="history-title">
										<v-icon
											:name="job.status === 'success' ? 'check_circle' : 'warning'"
											:class="job.status === 'success' ? 'status-success' : 'status-warning'"
										/>
										<span class="profile-name">{{ job.profile_id?.name || t('deleted_profile') }}</span>
										<v-chip x-small v-if="job.profile_id?.collection">{{ job.profile_id.collection }}</v-chip>
									</div>
									<div class="history-meta">
										<span class="history-date">{{ formatDate(job.date_created) }}</span>
									</div>
								</div>
								<div class="history-stats">
									<span class="stat-badge success">
										<v-icon name="check" x-small />
										{{ job.report?.success || 0 }}
									</span>
									<span class="stat-badge" :class="job.report?.errors > 0 ? 'error' : 'neutral'">
										<v-icon name="close" x-small />
										{{ job.report?.errors || 0 }}
									</span>
									<v-icon :name="expandedJobs.includes(job.id) ? 'expand_less' : 'expand_more'" class="expand-icon" />
								</div>
							</div>

							<div v-if="expandedJobs.includes(job.id)" class="history-details">
								<div v-if="job.report?.dry_run" class="dry-run-badge">
									<v-icon name="science" x-small /> {{ t('dry_run_label') }}
								</div>

								<!-- Warnings -->
								<div v-if="job.report?.warnings?.length > 0" class="report-section">
									<h4 class="section-title warning-title">
										<v-icon name="info" small /> {{ t('warnings') }} ({{ job.report.warnings.length }})
									</h4>
									<div class="warnings-compact">
										<div v-for="(warn, i) in job.report.warnings.slice(0, 10)" :key="i" class="warning-row">
											<span class="row-num">{{ t('row') }} {{ warn.row_index }}</span>
											<span class="warning-text">{{ warn.warning }}</span>
										</div>
										<div v-if="job.report.warnings.length > 10" class="more-items">
											... {{ t('and_more', { count: job.report.warnings.length - 10 }) }}
										</div>
									</div>
								</div>

								<!-- Errors -->
								<div v-if="job.report?.details?.length > 0" class="report-section">
									<h4 class="section-title error-title">
										<v-icon name="error" small /> {{ t('errors') }} ({{ job.report.details.length }})
									</h4>
									<div class="errors-list">
										<div v-for="(err, i) in job.report.details.slice(0, 20)" :key="i" class="error-row">
											<div class="error-header-row">
												<span class="row-num">{{ t('row') }} {{ err.row_index }}</span>
												<v-chip x-small v-if="err.code" class="error-code">{{ err.code }}</v-chip>
											</div>
											<div class="error-message">{{ err.error }}</div>

											<div v-if="err.validation?.length > 0" class="validation-details">
												<div v-for="(v, vi) in err.validation" :key="vi" class="validation-item">
													<strong>{{ v.field }}:</strong> {{ v.message }}
												</div>
											</div>

											<details class="error-debug">
												<summary>{{ t('debug_data') }}</summary>
												<div class="debug-grid">
													<div class="debug-block">
														<strong>{{ t('payload_sent') }}:</strong>
														<pre>{{ JSON.stringify(err.payload_sent, null, 2) }}</pre>
													</div>
													<div class="debug-block">
														<strong>{{ t('original_data') }}:</strong>
														<pre>{{ JSON.stringify(err.original_data, null, 2) }}</pre>
													</div>
												</div>
											</details>
										</div>
										<div v-if="job.report.details.length > 20" class="more-items">
											... {{ t('and_more', { count: job.report.details.length - 20 }) }}
										</div>
									</div>
								</div>

								<!-- Success message if no errors -->
								<div v-if="!job.report?.details?.length && !job.report?.warnings?.length" class="success-message">
									<v-icon name="check_circle" />
									{{ t('import_success_no_errors') }}
								</div>
							</div>
						</v-card-text>
					</v-card>
				</div>
			</div>

			<div v-if="activeTab === 'settings'" class="tab-content">
				<v-card class="mb-20">
					<v-card-title>{{ t('gallery_defaults_title') }}</v-card-title>
					<v-card-text>
						<p class="type-note mb-10">{{ t('gallery_defaults_note') }}</p>
						<div class="grid">
							<v-field :label="t('gallery_mode')">
								<v-select
									v-model="galleryDefaults.mode"
									:items="[
										{ text: t('gallery_mode_replace'), value: 'replace' },
										{ text: t('gallery_mode_append'), value: 'append' },
										{ text: t('gallery_mode_skip'), value: 'skip_existing' }
									]"
									@update:modelValue="saveGalleryDefaults"
								/>
							</v-field>
							<v-field :label="t('gallery_delimiter')">
								<v-input
									v-model="galleryDefaults.delimiter"
									placeholder=","
									@blur="saveGalleryDefaults"
								/>
							</v-field>
						</div>
						<div class="grid mt-10">
							<v-field :label="t('gallery_base_url')">
								<v-input
									v-model="galleryDefaults.base_url"
									:placeholder="t('gallery_base_url_placeholder')"
									@blur="saveGalleryDefaults"
								/>
								<span class="type-note">{{ t('gallery_base_url_note') }}</span>
							</v-field>
						</div>
						<div class="mt-10">
							<v-checkbox
								v-model="galleryDefaults.skip_errors"
								:label="t('gallery_skip_errors')"
								@update:modelValue="saveGalleryDefaults"
							/>
						</div>
					</v-card-text>
				</v-card>
				<v-card>
					<v-card-title>{{ t('danger_zone') }}</v-card-title>
					<v-card-text>
						<v-notice type="warning" class="mb-20">
							{{ t('uninstall_warning') }}
						</v-notice>
						<div class="mb-20">
							<p class="mb-10">{{ t('type_uninstall') }}</p>
							<v-input v-model="uninstallConfirm" placeholder="UNINSTALL" />
						</div>
						<v-button
							kind="danger"
							@click="uninstallExtension"
							:disabled="uninstallConfirm !== 'UNINSTALL'"
							:loading="loading"
						>
							{{ t('uninstall_btn') }}
						</v-button>
					</v-card-text>
				</v-card>
			</div>
		</div>

		<v-dialog v-model="importModal" @esc="!importInProgress && (importModal = false)" :persistent="importInProgress">
			<v-card class="import-modal">
				<v-card-title>{{ importInProgress ? t('running_import') : t('import_complete') }}</v-card-title>
				<v-card-text>
					<div v-if="importInProgress" class="import-progress">
						<v-progress-linear :value="importProgress.percent" />
						<p class="progress-text">{{ importProgress.current }} / {{ importProgress.total }}</p>
						<div class="progress-stats">
							<span class="stat success">
								<v-icon name="check_circle" x-small />
								{{ importProgress.success }}
							</span>
							<span class="stat error" v-if="importProgress.errors > 0">
								<v-icon name="error" x-small />
								{{ importProgress.errors }}
							</span>
						</div>
						<p class="progress-percent">{{ importProgress.percent }}%</p>
					</div>
					<div v-else-if="importResult">
						<div class="import-result-summary">
							<div class="result-item success">
								<v-icon name="check_circle" />
								<span class="result-count">{{ importResult.success }}</span>
								<span class="result-label">{{ t('success_count') }}</span>
							</div>
							<div class="result-item" :class="importResult.errors > 0 ? 'error' : ''">
								<v-icon :name="importResult.errors > 0 ? 'error' : 'check_circle'" />
								<span class="result-count">{{ importResult.errors }}</span>
								<span class="result-label">{{ t('error_count') }}</span>
							</div>
						</div>
					</div>
				</v-card-text>
				<v-card-actions v-if="!importInProgress">
					<v-button @click="importModal = false">{{ t('close') }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</private-view>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';

const { useNotificationsStore, useUserStore } = useStores();
const notifications = useNotificationsStore();
const userStore = useUserStore();
const api = useApi();

const activeTab = ref('profiles'); // Default to Saved Profiles
const step = ref(1);
const loading = ref(false);
const collections = ref([]);
const targetFields = ref([]);
const previewData = ref({ headers: [], preview: [], sheets: [], current_sheet: '' });
const profiles = ref([]);
const history = ref([]);
const expandedJobs = ref([]);
const runningProfile = ref(null);
const importModal = ref(false);
const importInProgress = ref(false);
const importProgress = ref({ current: 0, total: 0, success: 0, errors: 0, percent: 0 });
const uninstallConfirm = ref('');
const editingProfileId = ref(null);
const relatedItems = ref({}); // Store fetched M2O items: { fieldName: [{text, value}] }
const isDryRun = ref(false);

// Gallery import defaults (stored in localStorage)
const GALLERY_DEFAULTS_KEY = 'directus_import_gallery_defaults';
const galleryDefaults = ref({
	mode: 'replace',
	delimiter: ',',
	skip_errors: true,
	base_url: '',
});

function loadGalleryDefaults() {
	try {
		const stored = localStorage.getItem(GALLERY_DEFAULTS_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			galleryDefaults.value = { ...galleryDefaults.value, ...parsed };
		}
	} catch (e) {
		console.warn('Failed to load gallery defaults:', e);
	}
}

function saveGalleryDefaults() {
	try {
		localStorage.setItem(GALLERY_DEFAULTS_KEY, JSON.stringify(galleryDefaults.value));
	} catch (e) {
		console.warn('Failed to save gallery defaults:', e);
	}
}

const locales = {
	en: {
		title: 'Import from URL',
		nav_import: 'New Import',
		nav_profiles: 'Saved Profiles',
		nav_history: 'History',
		nav_settings: 'Settings',
		no_profiles: 'No saved profiles found.',
		no_history: 'No import history found.',
		edit: 'Edit',
		delete: 'Delete',
		run_now: 'Run Now',
		source_url: 'Source URL',
		source_url_note: 'Must be a published Google Sheets link (File > Share > Publish to web) or a direct CSV/TSV URL.',
		target_collection: 'Target Collection',
		select_collection: 'Select collection...',
		delimiter: 'Delimiter',
		has_header: 'First row contains headers',
		continue_preview: 'Continue to Preview',
		select_sheet: 'Select Sheet',
		step_2_title: 'Step 2: Preview and Mapping',
		import_settings: 'Import Settings',
		profile_name: 'Profile Name (Optional)',
		profile_name_placeholder: 'My Import Profile',
		import_mode: 'Import Mode',
		skip_empty: 'Skip empty values',
		force_publish: 'Publish all imported items (set status to "published")',
		csv_column_key: 'CSV Column (unique key)',
		collection_field_match: 'Collection Field (to match)',
		select_column: 'Select column...',
		select_field: 'Select field...',
		field_mapping: 'Field Mapping',
		skip_column: 'Skip column',
		back: 'Back',
		save_profile: 'Save Profile',
		update_profile: 'Update Profile',
		run_import: 'Run Import',
		dry_run: 'Test Run',
		dry_run_title: 'Test Run Results',
		dry_run_desc: 'No data was modified. Review what will happen:',
		will_create: 'Will create',
		will_update: 'Will update',
		import_complete: 'Import Complete',
		processed: 'Processed',
		success_count: 'Success',
		error_count: 'Errors',
		rows: 'rows',
		error_details: 'Error details',
		warning_details: 'Warnings',
		row: 'Row',
		start_new: 'Start New Import',
		danger_zone: 'Danger Zone',
		uninstall_warning: 'Uninstalling will delete all saved import profiles and job history from the database. This action cannot be undone.',
		type_uninstall: 'Type UNINSTALL to confirm:',
		uninstall_btn: 'Uninstall Extension Data',
		running_import: 'Running Import',
		processing_rows: 'Processing {count} rows...',
		please_wait: 'Please wait, this may take a moment',
		close: 'Close',
		confirm_delete: 'Are you sure you want to delete this profile?',
		profile_saved: 'Profile Saved',
		profile_updated: 'Profile Updated',
		extension_uninstalled: 'Extension Uninstalled',
		data_removed: 'Data tables removed.',
		uninstall_failed: 'Uninstall Failed',
		error_fetching: 'Error fetching preview',
		error_saving: 'Error saving profile',
		error_running: 'Error running import',
		error_running_profile: 'Error running profile',
		default_values: 'Default Values',
		no_defaults: 'No default values set. Add fields for data missing in source file.',
		add_default_field: 'Add Default Field',
		default_value_placeholder: 'Enter default value',
		select_value: 'Select value...',
		enabled: 'Enabled',
		show_debug: 'Show Debug Info',
		last_run: 'Last run',
		never_run: 'Never run',
		mode_insert: 'Insert',
		mode_upsert: 'Upsert',
		history_profile: 'Profile',
		history_date: 'Date',
		history_success: 'Success',
		history_errors: 'Errors',
		history_status: 'Status',
		deleted_profile: 'Deleted profile',
		dry_run_label: 'Test run (no changes)',
		warnings: 'Warnings',
		errors: 'Errors',
		and_more: 'and {count} more...',
		debug_data: 'Debug data',
		payload_sent: 'Payload sent',
		original_data: 'Original data',
		import_success_no_errors: 'Import completed successfully with no errors',
		gallery_settings: 'Gallery Import Settings',
		gallery_mode: 'Import Mode',
		gallery_mode_replace: 'Replace (clear existing)',
		gallery_mode_append: 'Append (add to end)',
		gallery_mode_skip: 'Skip existing (by filename)',
		gallery_mode_note: 'How to handle existing gallery images',
		gallery_delimiter: 'URL Delimiter',
		gallery_delimiter_note: 'Character separating multiple image URLs in gallery field (default: comma)',
		gallery_skip_errors: 'Skip invalid image URLs',
		gallery_defaults_title: 'Gallery Import Defaults',
		gallery_defaults_note: 'Default settings applied to new imports with gallery fields',
		gallery_base_url: 'Base URL for Images',
		gallery_base_url_note: 'Prefix for relative paths (e.g., https://example.com). Leave empty if URLs are already absolute.',
		gallery_base_url_placeholder: 'https://example.com'
	},
	ru: {
		title: 'Импорт по URL',
		nav_import: 'Новый импорт',
		nav_profiles: 'Сохраненные профили',
		nav_history: 'История',
		nav_settings: 'Настройки',
		no_profiles: 'Сохраненных профилей не найдено.',
		no_history: 'История импортов пуста.',
		edit: 'Редактировать',
		delete: 'Удалить',
		run_now: 'Запустить',
		source_url: 'URL источника',
		source_url_note: 'Должна быть опубликованная ссылка Google Sheets (Файл > Поделиться > Опубликовать в интернете) или прямая ссылка на CSV/TSV.',
		target_collection: 'Целевая коллекция',
		select_collection: 'Выберите коллекцию...',
		delimiter: 'Разделитель',
		has_header: 'Первая строка содержит заголовки',
		continue_preview: 'Далее к предпросмотру',
		select_sheet: 'Выберите лист',
		step_2_title: 'Шаг 2: Предпросмотр и сопоставление',
		import_settings: 'Настройки импорта',
		profile_name: 'Название профиля (опционально)',
		profile_name_placeholder: 'Мой профиль импорта',
		import_mode: 'Режим импорта',
		skip_empty: 'Пропускать пустые значения',
		force_publish: 'Опубликовать сразу (статус "published")',
		csv_column_key: 'Колонка в файле (ключ)',
		collection_field_match: 'Поле коллекции (для поиска)',
		select_column: 'Выберите колонку...',
		select_field: 'Выберите поле...',
		field_mapping: 'Сопоставление полей',
		skip_column: 'Пропустить колонку',
		back: 'Назад',
		save_profile: 'Сохранить профиль',
		update_profile: 'Обновить профиль',
		run_import: 'Запустить импорт',
		dry_run: 'Тест',
		dry_run_title: 'Результаты тестового запуска',
		dry_run_desc: 'Данные не были изменены. Просмотрите что произойдёт:',
		will_create: 'Будет создано',
		will_update: 'Будет обновлено',
		import_complete: 'Импорт завершен',
		processed: 'Обработано',
		success_count: 'Успешно',
		error_count: 'Ошибки',
		rows: 'строк',
		error_details: 'Детали ошибок',
		warning_details: 'Предупреждения',
		row: 'Строка',
		start_new: 'Новый импорт',
		danger_zone: 'Опасная зона',
		uninstall_warning: 'Удаление приведет к полному удалению всех сохраненных профилей и истории импортов из базы данных. Это действие необратимо.',
		type_uninstall: 'Напишите UNINSTALL для подтверждения:',
		uninstall_btn: 'Удалить данные расширения',
		running_import: 'Выполняется импорт',
		processing_rows: 'Обработка {count} строк...',
		please_wait: 'Пожалуйста, подождите',
		close: 'Закрыть',
		confirm_delete: 'Вы уверены, что хотите удалить этот профиль?',
		profile_saved: 'Профиль сохранен',
		profile_updated: 'Профиль обновлен',
		extension_uninstalled: 'Расширение удалено',
		data_removed: 'Таблицы данных удалены.',
		uninstall_failed: 'Ошибка удаления',
		error_fetching: 'Ошибка получения предпросмотра',
		error_saving: 'Ошибка сохранения профиля',
		error_running: 'Ошибка запуска импорта',
		error_running_profile: 'Ошибка запуска профиля',
		default_values: 'Значения по умолчанию',
		no_defaults: 'Нет настроенных значений по умолчанию. Добавьте поля, отсутствующие в файле.',
		add_default_field: 'Добавить поле',
		default_value_placeholder: 'Введите значение',
		select_value: 'Выберите значение...',
		enabled: 'Включено',
		show_debug: 'Показать отладочную информацию',
		last_run: 'Последний запуск',
		never_run: 'Не запускался',
		mode_insert: 'Вставка',
		mode_upsert: 'Обновление',
		history_profile: 'Профиль',
		history_date: 'Дата',
		history_success: 'Успешно',
		history_errors: 'Ошибки',
		history_status: 'Статус',
		deleted_profile: 'Удаленный профиль',
		dry_run_label: 'Тестовый запуск (без изменений)',
		warnings: 'Предупреждения',
		errors: 'Ошибки',
		and_more: 'и ещё {count}...',
		debug_data: 'Отладочные данные',
		payload_sent: 'Отправленные данные',
		original_data: 'Исходные данные',
		import_success_no_errors: 'Импорт завершён успешно без ошибок',
		gallery_settings: 'Настройки импорта галереи',
		gallery_mode: 'Режим импорта',
		gallery_mode_replace: 'Заменить (очистить существующие)',
		gallery_mode_append: 'Добавить (в конец)',
		gallery_mode_skip: 'Пропустить существующие (по имени файла)',
		gallery_mode_note: 'Как обрабатывать существующие изображения в галерее',
		gallery_delimiter: 'Разделитель URL',
		gallery_delimiter_note: 'Символ, разделяющий URL изображений в поле галереи (по умолчанию: запятая)',
		gallery_skip_errors: 'Пропускать некорректные URL изображений',
		gallery_defaults_title: 'Настройки галереи по умолчанию',
		gallery_defaults_note: 'Настройки по умолчанию для новых импортов с полями галереи',
		gallery_base_url: 'Базовый URL для изображений',
		gallery_base_url_note: 'Префикс для относительных путей (например, https://example.com). Оставьте пустым, если URL уже полные.',
		gallery_base_url_placeholder: 'https://example.com'
	}
};

const userLang = computed(() => {
	const directusLang = userStore.currentUser?.language;
	const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
	const lang = directusLang || browserLang || 'en-US';
	return lang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
});

function t(key, params = {}) {
	let text = locales[userLang.value]?.[key] || locales['en'][key] || key;
	for (const [param, value] of Object.entries(params)) {
		text = text.replace(`{${param}}`, value);
	}
	return text;
}

function formatDate(date) {
	if (!date) return '';
	const d = new Date(date);
	return d.toLocaleString(userLang.value === 'ru' ? 'ru-RU' : 'en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

// SSE helper for POST requests with progress
async function fetchWithSSE(path, body, onProgress) {
	const token = api.defaults.headers.common['Authorization'];
	// Use current origin for base URL
	const baseUrl = window.location.origin;
	const url = baseUrl + path;

	try {
		const response = await fetch(url + '?sse=true', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': token
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(errorText || `HTTP ${response.status}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let finalResult = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					try {
						const data = JSON.parse(line.slice(6));
						if (data.done) {
							finalResult = data;
						} else {
							onProgress(data);
						}
					} catch (e) {
						console.warn('SSE parse error', e);
					}
				}
			}
		}

		return finalResult;
	} catch (e) {
		console.error('SSE fetch error:', e);
		throw e;
	}
}

const navigation = computed(() => [
	{ id: 'profiles', name: t('nav_profiles'), icon: 'settings_backup_restore' },
	{ id: 'import', name: t('nav_import'), icon: 'auto_fix_high' },
	{ id: 'history', name: t('nav_history'), icon: 'history' },
	{ id: 'settings', name: t('nav_settings'), icon: 'settings' },
]);

const delimiterItems = [
	{ text: 'Auto', value: 'auto' },
	{ text: 'Comma (,)', value: ',' },
	{ text: 'Semicolon (;)', value: ';' },
	{ text: 'Tab', value: '\t' }
];

const modeItems = [
	{ text: 'Insert', value: 'insert' },
	{ text: 'Upsert (Update if exists)', value: 'upsert' }
];

const collectionItems = computed(() => {
	return collections.value.map(c => ({ text: c.collection, value: c.collection }));
});

const fieldItems = computed(() => {
	return targetFields.value.map(f => ({ text: f.field, value: f.field }));
});

const sourceFieldItems = computed(() => {
	return previewData.value.headers.map(h => ({ text: h, value: h }));
});

const sheetItems = computed(() => {
	return (previewData.value.sheets || []).map(s => ({ text: s, value: s }));
});

const form = ref({
	collection: '',
	url: '',
	name: '',
	delimiter: 'auto',
	has_header: true,
	sheet_name: '',
	mapping: {},
	mode: 'insert',
	match_field: 'id',
	match_source: '',
	skip_empty_values: true,
	force_publish: false,
	defaults: {},
	gallery_options: {
		delimiter: ',',
		folder: null,
		skip_errors: true,
		mode: 'replace',
		base_url: '',
	}
});

// Gallery-grid fields info (junction collection, fields)
const galleryGridFields = ref({});

// Helper to detect gallery-grid fields
function isGalleryGridField(field) {
	// Gallery fields are alias type with gallery-grid or files interface
	// special can be 'm2m' or 'files' depending on configuration
	return field.type === 'alias' &&
		(field.meta?.interface === 'gallery-grid' || field.meta?.interface === 'files');
}

const importResult = ref(null);

onMounted(async () => {
	loadGalleryDefaults();
	const resp = await api.get('/collections');
	collections.value = resp.data.data.filter(c => !c.collection.startsWith('directus_'));
	loadProfiles();
});

watch(activeTab, (val) => {
	if (val === 'profiles') loadProfiles();
	if (val === 'history') loadHistory();
});

async function loadProfiles() {
	try {
		const resp = await api.get('/items/directus_import_profiles?sort=-date_updated');
		profiles.value = resp.data.data;
	} catch (e) {
		// Ignore 403/404 if tables don't exist yet/deleted
		profiles.value = [];
	}
}

async function loadHistory() {
	try {
		const resp = await api.get('/items/directus_import_jobs?sort=-date_created&limit=50&fields=*,profile_id.name,profile_id.collection');
		history.value = resp.data.data;
	} catch (e) {
		history.value = [];
	}
}

function toggleJobDetails(jobId) {
	const idx = expandedJobs.value.indexOf(jobId);
	if (idx === -1) {
		expandedJobs.value.push(jobId);
	} else {
		expandedJobs.value.splice(idx, 1);
	}
}

watch(() => form.value.collection, async (newVal) => {
	if (!newVal) return;

	// Reset gallery fields info
	galleryGridFields.value = {};

	const resp = await api.get(`/fields/${newVal}`);
	const allFields = resp.data.data;

	// Include all fields except alias (interface-only) and special system fields
	// BUT allow gallery-grid and files alias fields
	targetFields.value = allFields.filter(f => {
		// Allow gallery-grid fields (alias with special: files)
		if (f.type === 'alias') {
			return isGalleryGridField(f);
		}
		// Exclude special interface types that are not real fields
		const excludedInterfaces = ['presentation-divider', 'presentation-links', 'presentation-notice', 'group-detail', 'group-raw'];
		if (f.meta?.interface && excludedInterfaces.includes(f.meta.interface)) return false;
		return true;
	});

	// Explicitly add SEO nested fields if an 'seo' field exists
	const seoField = targetFields.value.find(f => f.field === 'seo');
	if (seoField) {
		const seoSubfields = ['title', 'meta_description', 'no_follow', 'no_index', 'canonical', 'og_image'];
		seoSubfields.forEach(sub => {
			targetFields.value.push({
				field: `seo.${sub}`,
				text: `SEO > ${sub} (seo.${sub})`
			});
		});
	}

	// Load relations to identify junction tables for gallery-grid fields
	try {
		const relResp = await api.get('/relations');
		const relations = relResp.data.data;

		for (const field of allFields) {
			if (isGalleryGridField(field)) {
				// Find junction relation: where meta.one_field === field.field
				const junctionRel = relations.find((r) =>
					r.related_collection === newVal &&
					r.meta?.one_field === field.field
				);

				if (junctionRel) {
					// Find file relation in junction collection
					const fileRel = relations.find((r) =>
						r.collection === junctionRel.collection &&
						r.related_collection === 'directus_files'
					);

					galleryGridFields.value[field.field] = {
						fieldName: field.field,
						junctionCollection: junctionRel.collection,
						junctionField: junctionRel.field,
						fileField: fileRel?.field || 'directus_files_id',
						folder: field.meta?.options?.folder || null,
					};
				}
			}
		}
	} catch (e) {
		console.warn('Failed to load relations for gallery fields:', e);
	}

    // Now that fields are loaded, fetch related items for any existing defaults
    // This fixes the race condition where defaults were checked before fields existed
    if (form.value.defaults && Object.keys(form.value.defaults).length > 0) {
        Object.keys(form.value.defaults).forEach(fieldName => {
            fetchRelatedItems(fieldName);
        });
    }
});

async function fetchPreview() {
	loading.value = true;
	try {
		const resp = await api.post('/import-from-url/preview', {
			url: form.value.url,
			delimiter: form.value.delimiter,
			has_header: form.value.has_header,
			sheet_name: form.value.sheet_name
		});
		previewData.value = resp.data;
		
		// Update form sheet name if backend returns current sheet (e.g. default) and form is empty
		if (resp.data.current_sheet && !form.value.sheet_name) {
			form.value.sheet_name = resp.data.current_sheet;
		}
		

		// Auto-map by name, preserving existing mappings if keys match
		const newMapping = { ...form.value.mapping };
		previewData.value.headers.forEach(h => {
			const lowerH = h.toLowerCase();
			const match = targetFields.value.find(f => f.field.toLowerCase() === lowerH);
			
			// Only auto-map if no mapping exists for this header AND we found a match
			if (!newMapping[h] && match) {
				newMapping[h] = match.field;
			}
		});
		form.value.mapping = newMapping;

		// Auto-detect match source field if "id" or similar exists
		const idMatch = previewData.value.headers.find(h => ['id', 'sku', 'code', 'email'].includes(h.toLowerCase()));
		if (idMatch) form.value.match_source = idMatch;

		step.value = 2;
	} catch (e) {
		notifications.add({ title: t('error_fetching'), text: e.message, type: 'error' });
		console.error(e);
	} finally {
		loading.value = false;
	}
}


function getProfilePayload() {
	return {
		name: form.value.name || `Import ${form.value.collection} ${new Date().toLocaleString()}`,
		collection: form.value.collection,
		url: form.value.url,
		mapping: form.value.mapping,
		mode: form.value.mode,
		match_field: form.value.match_field,
		match_source: form.value.match_source,
		delimiter: form.value.delimiter,
		has_header: form.value.has_header,
		sheet_name: form.value.sheet_name,
		skip_empty_values: form.value.skip_empty_values,
		force_publish: form.value.force_publish,
		defaults: form.value.defaults,
		gallery_options: form.value.gallery_options,
		gallery_fields: galleryGridFields.value
	};
}

// Check if any mapping targets a gallery field
const hasGalleryMappings = computed(() => {
	return Object.values(form.value.mapping).some(
		(targetField) => galleryGridFields.value[targetField]
	);
});

async function saveProfile() {
	loading.value = true;
	try {
		const payload = getProfilePayload();
		
		if (editingProfileId.value) {
			await api.patch(`/items/directus_import_profiles/${editingProfileId.value}`, payload);
			notifications.add({ title: t('profile_updated'), type: 'success' });
		} else {
			await api.post('/items/directus_import_profiles', payload);
			notifications.add({ title: t('profile_saved'), type: 'success' });
		}

		activeTab.value = 'profiles'; // Switch to profiles tab
		reset(); // Reset wizard
		loadProfiles();
	} catch (e) {
		notifications.add({ title: t('error_saving'), text: e.message, type: 'error' });
		console.error(e);
	} finally {
		loading.value = false;
	}
}

async function startImport() {
	loading.value = true;
	isDryRun.value = false;
	importInProgress.value = true;
	importModal.value = true;
	importResult.value = null;
	importProgress.value = { current: 0, total: 0, success: 0, errors: 0, percent: 0 };

	try {
		let profileId;
		const payload = getProfilePayload();

		if (editingProfileId.value) {
			await api.patch(`/items/directus_import_profiles/${editingProfileId.value}`, payload);
			profileId = editingProfileId.value;
		} else {
			const profileResp = await api.post('/items/directus_import_profiles', payload);
			profileId = profileResp.data.data.id;
			editingProfileId.value = profileId;
		}

		const result = await fetchWithSSE(
			`/import-from-url/profiles/${profileId}/run`,
			{},
			(progress) => {
				importProgress.value = progress;
			}
		);

		if (result.error) {
			throw new Error(result.error);
		}

		importResult.value = result;
		importModal.value = false;
		step.value = 3;
	} catch (e) {
		notifications.add({ title: t('error_running'), text: e.message, type: 'error' });
		importModal.value = false;
		console.error(e);
	} finally {
		loading.value = false;
		importInProgress.value = false;
	}
}

async function startDryRun() {
	loading.value = true;
	isDryRun.value = true;
	importInProgress.value = true;
	importModal.value = true;
	importResult.value = null;
	importProgress.value = { current: 0, total: 0, success: 0, errors: 0, percent: 0 };

	try {
		const payload = {
			collection: form.value.collection,
			url: form.value.url,
			mapping: form.value.mapping,
			mode: form.value.mode,
			match_field: form.value.match_field,
			match_source: form.value.match_source,
			delimiter: form.value.delimiter,
			has_header: form.value.has_header,
			sheet_name: form.value.sheet_name,
			skip_empty_values: form.value.skip_empty_values,
			force_publish: form.value.force_publish,
			defaults: form.value.defaults,
			gallery_options: form.value.gallery_options,
			gallery_fields: galleryGridFields.value,
			dry_run: true
		};

		const result = await fetchWithSSE(
			`/import-from-url/run`,
			payload,
			(progress) => {
				importProgress.value = progress;
			}
		);

		if (result.error) {
			throw new Error(result.error);
		}

		importResult.value = result;
		importModal.value = false;
		step.value = 3;
	} catch (e) {
		notifications.add({ title: t('error_running'), text: e.message, type: 'error' });
		importModal.value = false;
		console.error(e);
	} finally {
		loading.value = false;
		importInProgress.value = false;
	}
}

async function runProfile(id) {
	runningProfile.value = id;
	importInProgress.value = true;
	importModal.value = true;
	importResult.value = null;
	importProgress.value = { current: 0, total: 0, success: 0, errors: 0, percent: 0 };

	try {
		const result = await fetchWithSSE(
			`/import-from-url/profiles/${id}/run`,
			{},
			(progress) => {
				importProgress.value = progress;
			}
		);

		if (result.error) {
			throw new Error(result.error);
		}

		importResult.value = result;
	} catch (e) {
		notifications.add({ title: t('error_running_profile'), text: e.message, type: 'error' });
		importModal.value = false;
		console.error(e);
	} finally {
		runningProfile.value = null;
		importInProgress.value = false;
		loadProfiles();
	}
}

async function deleteProfile(id) {
	if (!confirm(t('confirm_delete'))) return;
	await api.delete(`/items/directus_import_profiles/${id}`);
	loadProfiles();
}

async function uninstallExtension() {
	if (uninstallConfirm.value !== 'UNINSTALL') return;
	loading.value = true;
	try {
		await api.delete('/import-from-url/uninstall');
		notifications.add({ title: t('extension_uninstalled'), text: t('data_removed'), type: 'success' });
		uninstallConfirm.value = '';
		// Optionally refresh page or reset state
		profiles.value = [];
	} catch (e) {
		notifications.add({ title: t('uninstall_failed'), text: e.message, type: 'error' });
	} finally {
		loading.value = false;
	}
}


function editProfile(profile) {
	editingProfileId.value = profile.id;
	form.value = {
		name: profile.name,
		collection: profile.collection,
		url: profile.url,
		delimiter: profile.delimiter || 'auto',
		has_header: profile.has_header !== false,
		sheet_name: profile.sheet_name || '',
		mapping: profile.mapping || {},
		mode: profile.mode || 'insert',
		match_field: profile.match_field || 'id',
		match_source: profile.match_source || '',
		skip_empty_values: profile.skip_empty_values !== false,
		force_publish: profile.force_publish === true,
		defaults: profile.defaults || {},
		gallery_options: profile.gallery_options || { delimiter: ',', folder: null, skip_errors: true, mode: 'replace', base_url: '' }
	};
	activeTab.value = 'import';
	step.value = 1;
}

const availableDefaultFields = computed(() => {
	const currentDefaults = Object.keys(form.value.defaults);
	return targetFields.value
		.filter(f => !currentDefaults.includes(f.field))
		.map(f => ({ text: f.text || f.field, value: f.field }));
});

function addDefaultField(fieldName) {
	form.value.defaults = {
		...form.value.defaults,
		[fieldName]: null
	};
    // Fetch items if relational
    fetchRelatedItems(fieldName);
}

function removeDefaultField(fieldName) {
	const newDefaults = { ...form.value.defaults };
	delete newDefaults[fieldName];
	// Vue might not track deletion reactively on deep objects properly in some versions, but reassignment works
	form.value.defaults = newDefaults;
}

function getFieldTitle(fieldName) {
	const field = targetFields.value.find(f => f.field === fieldName);
	return field ? (field.text || field.field) : fieldName;
}

function isRelationalField(field) {
	return !!field.schema?.foreign_key_table || field.meta?.special?.includes('m2o');
}

async function fetchRelatedItems(fieldName) {
	const field = targetFields.value.find(f => f.field === fieldName);
	if (!field || !isRelationalField(field)) return;

	// Determine collection
	const collection = field.schema?.foreign_key_table;
	if (!collection) return;

	try {
        // Fetch items with a reasonable limit
		const resp = await api.get(`/items/${collection}?limit=100`);
		let items = resp.data.data;
		
		// If we have a saved value that is NOT in the list, fetch it specifically
		const savedValue = form.value.defaults[fieldName];
		if (savedValue && !items.find(i => i.id == savedValue)) {
			try {
				const specificResp = await api.get(`/items/${collection}/${savedValue}`);
				if (specificResp.data.data) {
					items.push(specificResp.data.data);
				}
			} catch (err) {
				console.warn('Could not fetch specific item', savedValue, err);
			}
		}

		relatedItems.value[fieldName] = items.map(item => {
            // Heuristic for display title: title, name, or id
			const text = item.title || item.name || item.id;
			return { text: String(text), value: item.id };
		});
	} catch (e) {
		console.warn('Error fetching related items for', fieldName, e);
		relatedItems.value[fieldName] = [];
	}
}

function getFieldInputType(fieldName) {
	const field = targetFields.value.find(f => f.field === fieldName);
	if (!field) return 'text';

	if (field.type === 'boolean') return 'checkbox';
	if (field.meta?.options?.choices) return 'select';
	if (isRelationalField(field)) return 'select';
	
	return 'text';
}

function getFieldOptions(fieldName) {
	const field = targetFields.value.find(f => f.field === fieldName);
    
    // Check for relational items first
    if (relatedItems.value[fieldName]) {
        return relatedItems.value[fieldName];
    }

	if (!field?.meta?.options?.choices) return [];
	
	// Choices can be array of strings or objects {text, value}
	return field.meta.options.choices.map(c => {
		if (typeof c === 'string') return { text: c, value: c };
		return { text: c.text, value: c.value };
	});
}

function reset() {
	step.value = 1;
	editingProfileId.value = null;
	importResult.value = null;
	form.value = {
		name: '',
		collection: '',
		url: '',
		delimiter: 'auto',
		has_header: true,
		sheet_name: '',
		mapping: {},
		mode: 'insert',
		match_field: 'id',
		match_source: '',
		skip_empty_values: true,
		force_publish: false,
		defaults: {},
		gallery_options: { ...galleryDefaults.value, folder: null }
	};
	previewData.value = { headers: [], preview: [], sheets: [], current_sheet: '' };
	targetFields.value = [];
	galleryGridFields.value = {};
}
</script>

<style scoped>
/* Navigation */
.v-list-item { cursor: pointer; }

.content { padding: 32px; max-width: 100%; }
.tab-content { max-width: 100%; margin: 0 auto; }
.tab-content :deep(.v-card) { max-inline-size: 100% !important; }
.tab-content :deep(.v-card-text) { padding: 24px !important; }

/* Grid Layouts */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.mt-10 { margin-top: 10px; }
.mt-20 { margin-top: 20px; }
.mb-10 { margin-bottom: 10px; }
.mb-20 { margin-bottom: 24px; }

/* Table Styles */
.table-container { 
	overflow-x: auto; 
	border: 1px solid var(--theme--form--field--input--border-color); 
	border-radius: var(--theme--border-radius); 
}
.preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.preview-table th, .preview-table td { 
	padding: 4px 8px; 
	border-bottom: 1px solid var(--theme--form--field--input--border-color); 
	text-align: left; 
	white-space: nowrap;
}

/* Error Details */
.error-item { border-bottom: 1px solid var(--theme--border-color-subdued); padding-bottom: 16px; }
.error-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.error-msg { color: var(--theme--danger); font-weight: 500; }
.validation-list { list-style: none; padding: 0; margin: 0; }
.subdued { color: var(--theme--foreground-subdued); cursor: pointer; font-size: 12px; }
.code-block { font-family: monospace; font-size: 11px; background: var(--theme--background-subdued); padding: 8px; border-radius: 4px; overflow-x: auto; }
.code-block pre { margin: 0; }
.ml-10 { margin-left: 10px; }
.mt-5 { margin-top: 5px; }
.mb-5 { margin-bottom: 5px; }
.preview-table th { 
	background: var(--theme--background-subdued); 
	font-weight: 600; 
	color: var(--project-color);
	margin-right: 8px;
}

.field-group {
	display: flex;
	flex-direction: column;
	width: 100%;
}

.type-label {
	font-weight: 600;
	font-size: 1rem;
	color: var(--theme--foreground);
	margin-bottom: 8px;
	display: block;
}

.type-note {
	font-size: 0.85rem;
	color: var(--theme--foreground-subdued);
	margin-top: 8px;
	line-height: 1.4;
}
.preview-table tr:last-child td { border-bottom: none; }

/* Mapping Grid */
.mapping-grid { display: flex; flex-direction: column; gap: 12px; }
.mapping-row { 
	display: grid; 
	grid-template-columns: 1fr 40px 1fr; 
	align-items: center; 
	gap: 16px; 
	background: var(--theme--background-subdued); 
	padding: 12px; 
	border-radius: var(--theme--border-radius); 
}
.column-name { font-weight: 600; font-size: 14px; color: var(--theme--foreground); }

/* Profile Card Styling */
.profiles-list { display: flex; flex-direction: column; gap: 12px; }
.profile-card { 
	display: flex; 
	justify-content: space-between; 
	align-items: center; 
	padding: 16px 20px !important; /* Override default v-card-text padding if needed */
}
.profile-info { 
	display: flex; 
	align-items: center; 
	gap: 16px; 
}
.profile-name { 
	font-weight: 700; 
	font-size: 16px; 
	color: var(--theme--foreground);
}
.profile-collection {
	display: flex;
	align-items: center;
}
.profile-actions { display: flex; gap: 12px; align-items: center; }

/* Utilities */
.actions { display: flex; gap: 12px; justify-content: flex-end; }

/* Defaults List */
.defaults-list { display: flex; flex-direction: column; gap: 8px; }
.default-row { 
	display: grid; 
	grid-template-columns: 200px 1fr 40px; 
	align-items: center; 
	gap: 16px; 
	background: var(--theme--background-subdued);
	padding: 8px 12px;
	border-radius: var(--theme--border-radius);
}
.field-name { font-weight: 500; font-size: 14px; }
.field-input { display: flex; align-items: center; }
.field-input :deep(.v-checkbox) { margin-bottom: 0; }

/* Enhanced Profile Card */
.profile-card-enhanced {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	padding: 16px 20px !important;
	gap: 16px;
}
.profile-main { flex: 1; }
.profile-header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 8px;
	flex-wrap: wrap;
}
.profile-badges { display: flex; gap: 8px; }
.profile-stats {
	display: flex;
	align-items: center;
	gap: 16px;
	font-size: 13px;
	color: var(--theme--foreground-subdued);
	flex-wrap: wrap;
}
.stat-item { display: flex; align-items: center; gap: 4px; }
.stat-label { color: var(--theme--foreground-subdued); }
.stat-value { font-weight: 500; color: var(--theme--foreground); }
.stat-value.success { color: var(--theme--success); }
.stat-value.error { color: var(--theme--danger); }
.status-success { color: var(--theme--success); }
.status-warning { color: var(--theme--warning); }
.chip-info { background: var(--theme--primary-background); color: var(--theme--primary); }
.chip-warning { background: var(--theme--warning-background); color: var(--theme--warning); }

/* History Table */
.history-table-container {
	overflow-x: auto;
	border: 1px solid var(--theme--form--field--input--border-color);
	border-radius: var(--theme--border-radius);
}
.history-table {
	width: 100%;
	border-collapse: collapse;
}
.history-table th, .history-table td {
	padding: 12px 16px;
	text-align: left;
	border-bottom: 1px solid var(--theme--form--field--input--border-color);
}
.history-table th {
	background: var(--theme--background-subdued);
	font-weight: 600;
	color: var(--theme--foreground);
}
.history-table tr:last-child td { border-bottom: none; }
.history-table tr:hover { background: var(--theme--background-subdued); }
.profile-link { font-weight: 500; }
.profile-collection-badge {
	margin-left: 8px;
	font-size: 11px;
	padding: 2px 6px;
	background: var(--theme--background-subdued);
	border-radius: 4px;
	color: var(--theme--foreground-subdued);
}
.success-cell { color: var(--theme--success); font-weight: 500; }
.error-cell { font-weight: 500; }
.error-cell.has-errors { color: var(--theme--danger); }

/* Dry Run & Warnings */
.dry-run-notice { margin-bottom: 16px; }
.warnings-list {
	list-style: none;
	padding: 0;
	margin: 10px 0;
}
.warning-item {
	padding: 8px 12px;
	background: var(--theme--warning-background);
	border-radius: 4px;
	margin-bottom: 8px;
	font-size: 13px;
}

/* Import Progress Modal */
.import-modal { min-width: 400px; }
.import-progress {
	text-align: center;
	padding: 20px 0;
}
.import-progress :deep(.v-progress-linear) {
	margin-bottom: 20px;
}
.progress-text {
	font-size: 16px;
	font-weight: 500;
	margin-bottom: 8px;
}
.progress-subtext {
	color: var(--theme--foreground-subdued);
	font-size: 14px;
}
.import-result-summary {
	display: flex;
	justify-content: center;
	gap: 40px;
	padding: 20px 0;
}
.result-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
}
.result-item .v-icon { font-size: 32px; }
.result-item.success .v-icon { color: var(--theme--success); }
.result-item.error .v-icon { color: var(--theme--danger); }
.result-count {
	font-size: 28px;
	font-weight: 700;
}
.result-item.success .result-count { color: var(--theme--success); }
.result-item.error .result-count { color: var(--theme--danger); }
.result-label {
	color: var(--theme--foreground-subdued);
	font-size: 14px;
}
.progress-stats {
	display: flex;
	justify-content: center;
	gap: 24px;
	margin: 16px 0;
}
.progress-stats .stat {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 14px;
	font-weight: 500;
}
.progress-stats .stat.success { color: var(--theme--success); }
.progress-stats .stat.error { color: var(--theme--danger); }
.progress-percent {
	font-size: 32px;
	font-weight: 700;
	color: var(--theme--primary);
	margin: 0;
}

/* History Cards */
.history-list { display: flex; flex-direction: column; gap: 12px; }
.history-card { transition: box-shadow 0.2s ease; }
.history-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }

.history-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	cursor: pointer;
	padding: 4px 0;
}
.history-header:hover { opacity: 0.9; }

.history-main { flex: 1; }
.history-title {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 15px;
	margin-bottom: 4px;
}
.history-title .profile-name { font-weight: 600; }
.history-meta { font-size: 13px; }
.history-date { color: var(--theme--foreground-subdued); }

.history-stats {
	display: flex;
	align-items: center;
	gap: 12px;
}
.stat-badge {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 10px;
	border-radius: 12px;
	font-size: 13px;
	font-weight: 500;
}
.stat-badge.success {
	background: var(--theme--success-background);
	color: var(--theme--success);
}
.stat-badge.error {
	background: var(--theme--danger-background);
	color: var(--theme--danger);
}
.stat-badge.neutral {
	background: var(--theme--background-subdued);
	color: var(--theme--foreground-subdued);
}
.expand-icon {
	color: var(--theme--foreground-subdued);
	margin-left: 8px;
}

/* Expanded Details */
.history-details {
	margin-top: 16px;
	padding-top: 16px;
	border-top: 1px solid var(--theme--border-color-subdued);
}
.dry-run-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	background: var(--theme--primary-background);
	color: var(--theme--primary);
	border-radius: 16px;
	font-size: 12px;
	font-weight: 500;
	margin-bottom: 16px;
}

.report-section { margin-bottom: 20px; }
.section-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
	margin-bottom: 12px;
}
.section-title.warning-title { color: var(--theme--warning); }
.section-title.error-title { color: var(--theme--danger); }

/* Warnings List */
.warnings-compact {
	background: var(--theme--warning-background);
	border-radius: 8px;
	padding: 12px;
}
.warning-row {
	display: flex;
	gap: 12px;
	padding: 6px 0;
	border-bottom: 1px solid rgba(255, 193, 7, 0.2);
	font-size: 13px;
}
.warning-row:last-child { border-bottom: none; }
.row-num {
	font-weight: 600;
	white-space: nowrap;
	min-width: 60px;
}
.warning-text { color: var(--theme--warning); }
.more-items {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
	padding-top: 8px;
	font-style: italic;
}

/* Errors List */
.errors-list { display: flex; flex-direction: column; gap: 12px; }
.error-row {
	background: var(--theme--danger-background);
	border-radius: 8px;
	padding: 12px;
}
.error-header-row {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 6px;
}
.error-code {
	background: var(--theme--danger);
	color: white;
	font-size: 10px;
}
.error-message {
	color: var(--theme--danger);
	font-weight: 500;
	font-size: 14px;
	margin-bottom: 8px;
}

.validation-details {
	background: rgba(0, 0, 0, 0.05);
	border-radius: 4px;
	padding: 8px 12px;
	margin-bottom: 8px;
}
.validation-item {
	font-size: 12px;
	padding: 4px 0;
	border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.validation-item:last-child { border-bottom: none; }

.error-debug {
	font-size: 12px;
	margin-top: 8px;
}
.error-debug summary {
	cursor: pointer;
	color: var(--theme--foreground-subdued);
	padding: 4px 0;
}
.error-debug summary:hover { color: var(--theme--foreground); }
.debug-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
	margin-top: 8px;
}
.debug-block {
	background: var(--theme--background-subdued);
	border-radius: 4px;
	padding: 8px;
	overflow-x: auto;
}
.debug-block strong {
	display: block;
	margin-bottom: 4px;
	font-size: 11px;
	color: var(--theme--foreground-subdued);
}
.debug-block pre {
	margin: 0;
	font-size: 11px;
	white-space: pre-wrap;
	word-break: break-word;
}

/* Success message */
.success-message {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px;
	background: var(--theme--success-background);
	color: var(--theme--success);
	border-radius: 8px;
	font-weight: 500;
}
.success-message .v-icon { font-size: 20px; }
</style>


